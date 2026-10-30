import { diffDays } from "../../calendar";
import type { EventDef } from "../def";
import { vary } from "../def";
import { nextSaturday } from "../time";
import { companyName, findFigure, localOutlet, partyLeader, partyPeople } from "../world";
import { actor, bairro, bestContact, brl, city, communityLeader, dayLabel, first, home, localPolitician, partiesNear, partyOf, relWith } from "./util";

/**
 * Vida comum, comunidade, trabalho e imprensa local: o começo de tudo.
 * Daqui saem as histórias encadeadas (a liderança do bairro que volta meses
 * depois, o encontro que abre a porta de um partido).
 */

// ---------------------------------------------------------------- convite inesperado
const convite_encontro_politico: EventDef = {
  id: "convite_encontro_politico",
  kind: "DECISAO",
  tags: ["COMUNIDADE", "PARTIDO"],
  weight: 1.3,
  cooldown: 150,
  max: 3,
  expires: 3,
  when: (c) => {
    if (c.phase || c.p.office_code) return null;
    if (c.p.party_id && c.st.party_standing >= 30) return null;
    const host = localPolitician(c, { office: "VEREADOR" });
    if (!host?.party_id) return null;
    const sat = nextSaturday(c.date);
    if (diffDays(sat, c.date) < 2) return null;
    return { host: host.id, party: host.party_id, sat, hood: bairro(c, `encontro:${host.id}`) };
  },
  weightFn: (c) => (c.p.party_id ? 0.5 : c.st.activism >= 10 ? 1.4 : 1),
  render: (c, b) => {
    const host = actor(c, b.host);
    const party = partyOf(c, b.party);
    const role = host?.office_code === "VEREADOR" ? `vereador(a) pelo ${party?.acronym}` : `liderança do ${party?.acronym}`;
    const opener = vary(c, "convite", [
      `Na saída do trabalho, ${host?.name}, ${role}, puxa conversa com você na calçada.`,
      `Você está na fila da padaria quando ${host?.name}, ${role}, reconhece você de uma reunião do bairro.`,
      `${host?.name}, ${role}, manda mensagem depois de ver você falando numa reunião do bairro.`,
    ]);
    return {
      title: "Um convite inesperado",
      who: host,
      text: `${opener} "Vai ter um encontro político no ${dayLabel(String(b.sat))}, no salão da associação do ${b.hood}. Vem gente da direção do partido. Acho que você tem perfil." Não é um compromisso qualquer: quem aparece nesses encontros costuma ser lembrado — para o bem e para o mal.`,
      choices: [
        { id: "aceitar", label: "Aceitar o convite", hint: "Você vai ao encontro no sábado", tone: "safe", cost: { energy: 5 } },
        { id: "aproximar", label: "Ir e tentar se aproximar das lideranças", hint: "Mais exposição, mais chance de ser notado(a) — e de parecer apressado(a)", tone: "bold", cost: { energy: 10 } },
        { id: "recusar", label: "Recusar educadamente", hint: "Agradece e deixa a porta aberta", tone: "neutral" },
        { id: "ignorar", label: "Ignorar o convite", hint: `${first(host)} pode não gostar`, tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const host = actor(c, b.host);
    if (choice === "aceitar" || choice === "aproximar") {
      fx.energy(choice === "aproximar" ? -10 : -5);
      if (host) fx.rel(host.id, 5);
      fx.schedule("encontro_sabado", Math.max(0, diffDays(String(b.sat), c.date)), { host: String(b.host), party: String(b.party), hood: String(b.hood), mode: choice });
      return `Você confirmou presença. ${first(host)} ficou de guardar um lugar para você no ${dayLabel(String(b.sat))}.`;
    }
    if (choice === "recusar") {
      if (host) fx.rel(host.id, 1);
      fx.flag(`recusou_encontro:${b.party}`, c.date);
      return `"Fica para a próxima, então." ${first(host)} entendeu — e disse que vai lembrar de você.`;
    }
    if (host) fx.rel(host.id, -6);
    return `${first(host)} esperou uma resposta que não veio. Na política, silêncio também é recado.`;
  },
  fallback: "ignorar",
};

const encontro_sabado: EventDef = {
  id: "encontro_sabado",
  kind: "DECISAO",
  tags: ["PARTIDO", "COMUNIDADE"],
  chained: true,
  expires: 1,
  when: (c, d) => {
    const host = actor(c, d?.host);
    const party = partyOf(c, d?.party);
    if (!host || !party || party.status !== "ATIVO") return null;
    const leader = partyLeader(c.ctx, c.p, party);
    return { ...d!, leader: leader.id };
  },
  render: (c, b) => {
    const party = partyOf(c, b.party)!;
    const leader = actor(c, b.leader);
    const early = b.mode === "aproximar";
    return {
      title: `Sábado no salão do ${b.hood}`,
      who: leader,
      text: `Umas sessenta pessoas, cadeiras de plástico, café no copinho. ${leader?.name ?? "O presidente municipal"} abre a reunião falando das eleições e da falta de gente nova no ${party.acronym}. ${early ? "Você chegou cedo, ajudou a montar o som e já trocou duas palavras com a direção. " : ""}No fim, o microfone fica aberto para quem quiser falar.`,
      choices: [
        { id: "falar", label: "Pedir a palavra e falar do seu bairro", hint: "Pode marcar presença — ou travar diante de todo mundo", tone: "bold" },
        { id: "circular", label: "Circular e trocar contatos", hint: "Menos brilho, mais relações", tone: "safe" },
        { id: "ouvir", label: "Só ouvir e sair cedo", hint: "Aprende como funciona, sem se expor", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const host = actor(c, b.host);
    const leader = actor(c, b.leader);
    const party = partyOf(c, b.party)!;
    const early = b.mode === "aproximar" ? 1 : 0;
    fx.flag(`conheceu:${party.id}`, c.date);
    if (choice === "falar") {
      const ok = c.roll(0.3 + c.charisma * 0.45 + Math.min(0.15, c.st.activism / 150) + early * 0.05);
      if (ok) {
        fx.reputation(2);
        fx.visibility(2);
        if (leader) fx.rel(leader.id, 10 + early * 4);
        if (host) fx.rel(host.id, 4);
        fx.schedule("dirigente_interessado", [12, 30], { party: party.id, leader: leader?.id ?? "" });
        return `Você falou três minutos sobre o ${home(c)} — ônibus, creche, iluminação. Foi aplaudido(a). Na saída, ${first(leader)} pediu seu telefone.`;
      }
      fx.reputation(-1);
      if (host) fx.rel(host.id, 2);
      return "A voz falhou na segunda frase e você perdeu o fio. Ninguém riu, mas também ninguém lembrou do que você disse. Faz parte: da próxima vez, prepare três pontos.";
    }
    if (choice === "circular") {
      if (leader) fx.rel(leader.id, 5 + early * 4);
      if (host) fx.rel(host.id, 6);
      const other = partyPeople(c.ctx, c.p, party).find((x) => x.id !== leader?.id && x.id !== host?.id);
      if (other) fx.rel(other.id, 6);
      if (c.roll(0.35 + early * 0.2)) fx.schedule("dirigente_interessado", [15, 40], { party: party.id, leader: leader?.id ?? "" });
      return `Você saiu com quatro contatos novos no celular${other ? `, entre eles ${other.name}` : ""}. Ninguém decide nada num sábado — mas todo mundo lembra quem estava lá.`;
    }
    fx.debate(2);
    if (host) fx.rel(host.id, 2);
    return `Você entendeu como o ${party.acronym} funciona por dentro: quem manda, quem disputa espaço, quem só aparece em eleição.`;
  },
  fallback: "ouvir",
};

// ---------------------------------------------------------------- a corrente do bairro
const evento_comunitario: EventDef = {
  id: "evento_comunitario",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE"],
  weight: 1.2,
  cooldown: 120,
  expires: 6,
  when: (c) => {
    if (c.phase === "RETA_FINAL") return null;
    const hood = c.rng.chance(0.6) ? home(c) : bairro(c, `evento:${c.date.slice(0, 7)}`);
    const what = c.rng.pick(["a festa junina da escola", "um mutirão de limpeza da praça", "a reunião mensal da associação de moradores", "um bazar beneficente da paróquia", "um torneio de futebol de várzea"]);
    return { hood, what };
  },
  render: (c, b) => ({
    title: `${String(b.what).replace(/^./, (x) => x.toUpperCase())} no ${b.hood}`,
    text: `Os organizadores de ${b.what} no ${b.hood} estão atrás de voluntários para o fim de semana. É trabalho braçal, sem palco — mas é ali que a cidade se conhece de verdade.`,
    choices: [
      { id: "organizar", label: "Ajudar a organizar", hint: "Cansa, mas você conhece quem move o bairro", tone: "bold", cost: { energy: 20 } },
      { id: "aparecer", label: "Aparecer e ajudar um pouco", hint: "Presença simples", tone: "safe", cost: { energy: 8 } },
      { id: "doar", label: "Não ir, mas mandar uma doação", hint: "Ajuda sem aparecer", tone: "neutral", cost: { money: c.money(300) } },
      { id: "passar", label: "Deixar passar", tone: "neutral" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    const hood = String(b.hood);
    if (choice === "organizar") {
      const leader = communityLeader(c, hood);
      fx.energy(-20);
      fx.activism(6);
      fx.reputation(1.5);
      fx.reach(0.006);
      fx.rel(leader.id, 12);
      fx.flag("lider_comunitario", leader.id);
      fx.schedule("lideranca_local_contato", [5, 12], { leader: leader.id, hood });
      if (c.p.stage === "CIDADAO" && c.st.activism + 6 >= 20) fx.stage("ATIVISTA");
      return `Você carregou mesa, organizou fila e terminou o dia sem voz. ${leader.name}, que preside a associação do ${hood}, fez questão de agradecer em público.`;
    }
    if (choice === "aparecer") {
      fx.energy(-8);
      fx.activism(2);
      fx.reputation(0.5);
      return "Você apareceu, ajudou no que deu e conversou com meia dúzia de vizinhos. Pouca coisa — mas lembram de você.";
    }
    if (choice === "doar") {
      fx.money(-c.money(300), `Doação para ${b.what}`);
      fx.reputation(0.5);
      return "A doação ajudou a pagar o som e os lanches. Seu nome apareceu num cartaz de agradecimento.";
    }
    return "O fim de semana passou. Ninguém cobrou, ninguém notou.";
  },
  fallback: "passar",
};

const lideranca_local_contato: EventDef = {
  id: "lideranca_local_contato",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE"],
  chained: true,
  expires: 7,
  when: (c, d) => (actor(c, d?.leader) ? d! : null),
  render: (c, b) => {
    const leader = actor(c, b.leader)!;
    const project = vary(c, "projeto", [
      "a reforma da quadra, parada há três anos",
      "um cursinho popular para o Enem no salão da associação",
      "a cobertura do ponto de ônibus em frente à escola",
      "uma horta comunitária no terreno baldio da rua de baixo",
    ]);
    return {
      title: "Uma ligação do bairro",
      who: leader,
      text: `${leader.name} liga numa terça à noite. "Gostei de ver você trabalhando no ${b.hood}. Tem um projeto nosso empacado: ${project}. Falta alguém com tempo e jeito para correr atrás. Topa?"`,
      choices: [
        { id: "topar", label: "Topar o projeto", hint: "Semanas de trabalho; se der certo, seu nome vai junto", tone: "bold" },
        { id: "indicar", label: "Indicar outra pessoa", hint: "Ajuda sem se comprometer", tone: "safe" },
        { id: "recusar", label: "Dizer que não dá agora", tone: "neutral" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const leader = actor(c, b.leader)!;
    if (choice === "topar") {
      fx.rel(leader.id, 8);
      fx.flag("projeto_bairro", leader.id);
      fx.schedule("projeto_comunitario", [10, 20], { leader: leader.id, hood: String(b.hood) });
      return `Vocês combinaram a primeira reunião. ${first(leader)} já avisou meio bairro que "agora vai".`;
    }
    if (choice === "indicar") {
      fx.rel(leader.id, 2);
      return `${first(leader)} agradeceu a indicação, mas a voz entregou a decepção.`;
    }
    fx.rel(leader.id, -3);
    return `"Tudo bem, a gente se vira." O projeto continua parado.`;
  },
  fallback: "recusar",
};

const projeto_comunitario: EventDef = {
  id: "projeto_comunitario",
  kind: "DECISAO",
  tags: ["COMUNIDADE"],
  chained: true,
  milestone: true,
  expires: 4,
  when: (c, d) => (actor(c, d?.leader) ? d! : null),
  render: (c, b) => {
    const leader = actor(c, b.leader)!;
    return {
      title: "O projeto do bairro emperrou na burocracia",
      who: leader,
      text: `Depois de semanas de reuniões, o projeto do ${b.hood} esbarrou na prefeitura: falta um ofício, falta verba, falta alguém que atenda o telefone. ${first(leader)} pergunta qual caminho seguir.`,
      choices: [
        { id: "vereadores", label: "Bater na porta de vereadores e da prefeitura", hint: "Desgasta, mas cria pontes políticas", tone: "safe", cost: { energy: 20 } },
        { id: "vaquinha", label: "Fazer uma vaquinha com os moradores e tocar sem a prefeitura", hint: "Você entra com uma parte", tone: "bold", cost: { money: c.money(1500) } },
        { id: "imprensa", label: "Chamar a imprensa para pressionar", hint: "Visibilidade — e o risco de expor o fracasso", tone: "risky", cost: { energy: 10 } },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const leader = actor(c, b.leader)!;
    const hood = String(b.hood);
    let ok = false;
    if (choice === "vereadores") {
      fx.energy(-20);
      ok = c.roll(0.45 + c.competence * 0.3 + Math.min(0.2, c.st.political_capital / 200));
      const v = localPolitician(c, { office: "VEREADOR" });
      if (v) fx.rel(v.id, ok ? 8 : 3);
      fx.capital(ok ? 3 : 1);
    } else if (choice === "vaquinha") {
      fx.money(-c.money(1500), `Vaquinha do projeto no ${hood}`);
      ok = c.roll(0.6 + c.charisma * 0.25);
    } else {
      fx.energy(-10);
      ok = c.roll(0.4 + c.charisma * 0.3);
      fx.visibility(ok ? 4 : 2);
    }
    if (ok) {
      fx.reputation(3);
      fx.visibility(3);
      fx.reach(0.012);
      fx.rel(leader.id, 15);
      fx.flag("projeto_ok", leader.id);
      fx.schedule("projeto_repercute", [2, 6], { leader: leader.id, hood });
      fx.schedule("lider_apresenta_partido", [70, 140], { leader: leader.id, hood });
      return `Saiu! A inauguração juntou o bairro inteiro e ${first(leader)} chamou você para cortar a fita. Pela primeira vez, gente que você nunca viu sabe seu nome.`;
    }
    fx.rel(leader.id, 3);
    fx.reputation(-0.5);
    return `Não foi desta vez: o projeto ficou para "o ano que vem". ${first(leader)} não culpa você — e notou que você não sumiu quando apertou.`;
  },
  fallback: "vereadores",
};

const projeto_repercute: EventDef = {
  id: "projeto_repercute",
  kind: "INFO",
  tags: ["COMUNIDADE", "IMPRENSA"],
  chained: true,
  when: (c, d) => d ?? null,
  render: (c, b) => ({
    title: "Seu nome no rádio",
    text: `A ${localOutlet(c.rng)} fez uma matéria sobre o projeto do ${b.hood} e citou você duas vezes. No grupo do bairro, a mensagem mais compartilhada da semana tem sua foto.`,
    choices: [],
  }),
  resolve: (c, b, _choice, fx) => {
    fx.visibility(3);
    fx.reach(0.008);
    fx.news("Projeto comunitário sai do papel", `O projeto do ${b.hood}, em ${city(c)}, foi concluído com apoio de moradores e de ${c.p.name}.`);
    return "Mais gente conhece você na cidade.";
  },
};

/** Meses depois, a liderança do bairro abre a porta de um partido. */
const lider_apresenta_partido: EventDef = {
  id: "lider_apresenta_partido",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE", "PARTIDO", "FILIACAO"],
  chained: true,
  milestone: true,
  expires: 20,
  when: (c, d) => {
    const leader = actor(c, d?.leader);
    if (!leader || relWith(c, leader.id) < 25) return null;
    const party = (leader.party_id ? partyOf(c, leader.party_id) : undefined) ?? partiesNear(c, { exclude: c.p.party_id })[0];
    if (!party || party.id === c.p.party_id) return null;
    return { ...d!, party: party.id };
  },
  render: (c, b) => {
    const leader = actor(c, b.leader)!;
    const party = partyOf(c, b.party)!;
    const dir = partyLeader(c.ctx, c.p, party);
    return {
      title: "Uma porta que se abre",
      who: leader,
      text: `Faz meses que o projeto do ${b.hood} saiu do papel, e ${leader.name} não esqueceu. "O pessoal do ${party.acronym} me perguntou de você. ${dir.name} quer conversar. Se você quiser, eu levo você lá e falo bem." ${c.p.party_id ? `Você já tem partido — mas convite assim não aparece duas vezes.` : "É o tipo de apresentação que nenhum pedido formal substitui."}`,
      choices: [
        { id: "ir", label: `Ir conversar com ${first(dir)}`, hint: `Relação forte com a direção do ${party.acronym}`, tone: "bold", cost: { energy: 8 } },
        { id: "agradecer", label: "Agradecer e deixar para depois", tone: "safe" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const leader = actor(c, b.leader)!;
    const party = partyOf(c, b.party)!;
    const dir = partyLeader(c.ctx, c.p, party);
    if (choice === "ir") {
      fx.energy(-8);
      fx.rel(dir.id, 18);
      fx.rel(leader.id, 4);
      fx.flag(`padrinho:${party.id}`, leader.id);
      if (!c.p.party_id) fx.schedule("dirigente_interessado", [6, 15], { party: party.id, leader: dir.id, warm: 1 });
      return `A conversa durou duas horas. ${first(dir)} terminou dizendo que "o ${party.acronym} precisa de gente como você". ${first(leader)} sorria como quem cumpriu uma promessa.`;
    }
    fx.rel(leader.id, -2);
    return `${first(leader)} entendeu. A porta continua lá — um pouco mais fechada.`;
  },
  fallback: "agradecer",
};

// ---------------------------------------------------------------- imprensa e redes
const entrevista_radio: EventDef = {
  id: "entrevista_radio",
  kind: "OPORTUNIDADE",
  tags: ["IMPRENSA"],
  cooldown: 110,
  expires: 5,
  when: (c) => (c.p.visibility >= 6 || c.st.activism >= 15 || c.p.party_id ? { outlet: localOutlet(c.rng), topic: c.rng.pick(["o transporte público", "a falta de vagas em creche", "a segurança no bairro", "o preço dos alimentos", "o lixo nas ruas"]) } : null),
  weightFn: (c) => (c.phase ? 1.5 : 1),
  render: (c, b) => ({
    title: `Convite da ${b.outlet}`,
    text: `O programa da manhã da ${b.outlet} quer ouvir você sobre ${b.topic} em ${city(c)}. São quinze minutos ao vivo, com ligação de ouvintes no final — e ouvinte de rádio não perdoa enrolação.`,
    choices: [
      { id: "propostas", label: "Ir e falar de soluções concretas", hint: "Seguro, se você estiver preparado(a)", tone: "safe", cost: { energy: 8 } },
      { id: "criticar", label: "Ir e criticar a prefeitura sem rodeios", hint: "Mais repercussão; cria inimigos", tone: "bold", cost: { energy: 8 } },
      { id: "recusar", label: "Recusar o convite", tone: "neutral" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    if (choice === "recusar") return "A produção chamou outra pessoa. O assunto seguiu sem você.";
    fx.energy(-8);
    const prepared = c.st.debate_prep / 100;
    if (choice === "propostas") {
      if (c.roll(0.55 + c.competence * 0.25 + prepared * 0.2)) {
        fx.reach(0.01);
        fx.reputation(1.5);
        fx.visibility(2);
        if (c.cand) fx.momentum(0.02, "entrevista na rádio");
        return "Você soou preparado(a). Um ouvinte ligou só para dizer que votaria em você \"se você fosse candidato(a)\".";
      }
      fx.reach(0.005);
      return "Uma ouvinte perguntou um dado que você não sabia. Você saiu pela tangente — e o apresentador notou.";
    }
    const mayor = localPolitician(c, { office: "PREFEITO" });
    if (mayor) fx.rel(mayor.id, -8);
    fx.reach(0.015);
    fx.visibility(4);
    if (c.roll(0.5 + c.charisma * 0.3)) {
      fx.reputation(1);
      if (c.cand) fx.momentum(0.03, "críticas na rádio");
      return `A entrevista virou assunto na cidade. ${mayor ? `${mayor.name} não gostou nada.` : "A prefeitura soltou nota."}`;
    }
    fx.reputation(-1.5);
    return "Você subiu o tom e perdeu a medida. Choveram mensagens dizendo que você \"só sabe reclamar\".";
  },
  fallback: "recusar",
};

const post_viral: EventDef = {
  id: "post_viral",
  kind: "OPORTUNIDADE",
  tags: ["IMPRENSA"],
  cooldown: 150,
  expires: 3,
  when: (c) => (c.p.visibility >= 4 || c.st.activism >= 10 ? { views: c.rng.int(40, 400) * 1000, topic: c.rng.pick(["o buraco que engoliu um carro na sua rua", "a fila de seis horas no posto de saúde", "o ônibus lotado às seis da manhã", "a escola sem professor de matemática"]) } : null),
  render: (c, b) => ({
    title: "Seu vídeo viralizou",
    text: `Um vídeo de um minuto que você gravou sobre ${b.topic} passou de ${Number(b.views).toLocaleString("pt-BR")} visualizações. Nos comentários, elogios, piadas e gente perguntando "quem é essa pessoa?". Também chegaram os primeiros ataques.`,
    choices: [
      { id: "serie", label: "Aproveitar e gravar uma série", hint: "Mais alcance; mais exposição a erros", tone: "bold", cost: { energy: 15 } },
      { id: "responder", label: "Responder os críticos um a um", hint: "Engaja — e pode virar briga", tone: "risky", cost: { energy: 8 } },
      { id: "quieto", label: "Agradecer e deixar quieto", tone: "safe" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "serie") {
      fx.energy(-15);
      fx.reach(0.015);
      fx.visibility(5);
      if (c.roll(0.25 - c.competence * 0.15)) {
        fx.reputation(-2);
        return "O terceiro vídeo tinha um número errado. Os mesmos perfis que compartilharam agora corrigem você — com menos educação.";
      }
      fx.reputation(1);
      if (c.cand) fx.momentum(0.03, "vídeos nas redes");
      return "A série pegou. Você ganhou milhares de seguidores e um apelido carinhoso na cidade.";
    }
    if (choice === "responder") {
      fx.energy(-8);
      fx.reach(0.008);
      if (c.roll(0.45 + c.charisma * 0.3)) {
        fx.reputation(1);
        return "Você respondeu com bom humor e virou o jogo nos comentários.";
      }
      fx.reputation(-2);
      return "Uma resposta atravessada virou print — e o print viralizou mais que o vídeo.";
    }
    fx.reach(0.004);
    fx.visibility(1);
    return "O vídeo teve seus dias de fama e passou. Ficaram alguns seguidores.";
  },
  fallback: "quieto",
};

// ---------------------------------------------------------------- trabalho e dinheiro
const chefe_cobra: EventDef = {
  id: "chefe_cobra",
  kind: "DECISAO",
  tags: ["TRABALHO"],
  cooldown: 180,
  expires: 4,
  when: (c) => (!c.p.office_code && c.jornada === 1 && (c.st.activism >= 15 || c.p.party_id || c.phase) ? { boss: c.rng.pick(["sua chefe", "seu chefe", "o sócio do escritório", "a coordenação"]) } : null),
  weightFn: (c) => (c.phase ? 1.6 : 0.8),
  render: (c, b) => ({
    title: "A política começou a pesar no trabalho",
    text: `${String(b.boss).replace(/^./, (x) => x.toUpperCase())} chama você para uma conversa a portas fechadas: as saídas mais cedo, o celular tocando, as faltas de sexta. "Eu respeito sua militância, mas aqui as contas não fecham sozinhas. O que você vai fazer?" Seu salário como ${c.professionLabel} é de ${brl(c.salary)} por mês.`,
    choices: [
      { id: "foco", label: "Prometer foco total no trabalho", hint: "Menos política por um tempo", tone: "safe" },
      { id: "meio", label: "Negociar meio período", hint: "Metade do salário, mais tempo e energia para a política", tone: "bold" },
      { id: "licenca", label: c.phase ? "Pedir licença sem salário até a eleição" : "Pedir demissão e viver a política", hint: c.phase ? "Sem salário até a eleição; muito mais tempo" : "Sem salário; todo o tempo para a política", tone: "risky" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "foco") {
      fx.activism(-4);
      fx.flag("foco_trabalho", c.date);
      fx.money(Math.round(c.salary * 0.1), "Bônus por desempenho");
      return "Você segurou a política por umas semanas. O clima no trabalho melhorou — e veio até um bônus.";
    }
    if (choice === "meio") {
      if (c.roll(0.5 + c.charisma * 0.3)) {
        fx.flag("jornada", 0.5);
        fx.energy(15);
        return "Acordo fechado: meio período, meio salário. A conta aperta, mas sobram as tardes.";
      }
      fx.flag("jornada", 0.5);
      fx.flag("foco_trabalho", c.date);
      return "Aceitaram o meio período, mas a contragosto. Agora qualquer deslize vai pesar.";
    }
    fx.flag("jornada", 0);
    if (c.phase) fx.flag("licenca_campanha", true);
    fx.energy(25);
    return c.phase ? "Licença sem salário até a eleição. Agora é tudo ou nada." : "Você entregou o crachá. Sem salário, cada mês vai custar a reserva — mas o tempo agora é todo seu.";
  },
  fallback: "foco",
};

/** Quem largou o emprego pela política recebe, cedo ou tarde, a chance (ou a necessidade) de voltar. */
const emprego_volta: EventDef = {
  id: "emprego_volta",
  kind: "DECISAO",
  tags: ["TRABALHO", "DINHEIRO"],
  blocking: false,
  cooldown: 75,
  expires: 10,
  when: (c) => (c.jornada < 1 && !c.p.office_code && !c.phase ? { boss: c.rng.pick(["Seu antigo chefe", "Uma antiga colega", "Um ex-cliente"]) } : null),
  weightFn: (c) => (c.st.debt > c.salary * 2 || c.st.money < c.salary ? 3 : 0.8),
  render: (c, b) => ({
    title: "Uma vaga de volta",
    text: `${b.boss} liga: "Abriu uma vaga aqui. Com o seu currículo, é sua se quiser." Hoje você ${c.jornada === 0 ? "está sem salário" : "trabalha meio período"}, tem ${brl(c.st.money)} na conta${c.st.debt > 0 ? ` e deve ${brl(c.st.debt)} ao banco` : ""}. O salário integral como ${c.professionLabel} é de ${brl(c.salary)}.`,
    choices: [
      { id: "integral", label: "Voltar em tempo integral", hint: "Salário cheio; menos tempo e energia para a política", tone: "safe" },
      ...(c.jornada === 0 ? [{ id: "meio", label: "Voltar em meio período", hint: "Metade do salário", tone: "neutral" as const }] : []),
      { id: "nao", label: "Agradecer e seguir como está", tone: "risky" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "integral") {
      fx.unflag("jornada");
      fx.unflag("licenca_campanha");
      return "Crachá novo, rotina antiga. O extrato vai agradecer no próximo mês.";
    }
    if (choice === "meio") {
      fx.flag("jornada", 0.5);
      return "Meio período: metade do salário, metade do dia para a política.";
    }
    return "Você agradeceu e recusou. A política continua sendo seu único emprego.";
  },
  fallback: "nao",
};

const trabalho_extra: EventDef = {
  id: "trabalho_extra",
  kind: "OPORTUNIDADE",
  tags: ["TRABALHO", "DINHEIRO"],
  cooldown: 130,
  expires: 7,
  when: (c) => (c.phase === "RETA_FINAL" ? null : { client: companyName(c.rng), amount: Math.round((c.salary * c.rng.range(0.4, 0.9)) / 100) * 100 }),
  weightFn: (c) => (c.st.money < c.salary * 2 ? 1.6 : 0.8),
  render: (c, b) => ({
    title: "Um trabalho grande apareceu",
    text: `A ${b.client} quer contratar você, como ${c.professionLabel}, para um serviço de duas semanas: ${brl(Number(b.amount))}. Dinheiro bom — e duas semanas longe das reuniões, dos grupos e da rua.`,
    choices: [
      { id: "aceitar", label: "Aceitar o trabalho", hint: "Dinheiro agora, energia a menos", tone: "safe", cost: { energy: 30 } },
      { id: "indicar", label: "Indicar um colega", hint: "Fica com um contato agradecido", tone: "neutral" },
      { id: "recusar", label: "Recusar e manter o foco", tone: "neutral" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    if (choice === "aceitar") {
      fx.energy(-30);
      fx.money(Number(b.amount), `Serviço para a ${b.client}`, "RENDA");
      fx.activism(-2);
      return "Duas semanas puxadas, um extrato bem mais bonito.";
    }
    if (choice === "indicar") {
      const colleague = findFigure(c.ctx, c.p, `colega:${c.professionId}`, `colega de profissão`, { age: [28, 55] });
      fx.rel(colleague.id, 10);
      return `${colleague.name} ficou com o serviço e prometeu retribuir. Na política, gente que deve favor vale ouro.`;
    }
    return "Você recusou. A conta bancária reclamou; a agenda agradeceu.";
  },
  fallback: "recusar",
};

const despesa_inesperada: EventDef = {
  id: "despesa_inesperada",
  kind: "DECISAO",
  tags: ["DINHEIRO", "VIDA"],
  cooldown: 240,
  expires: 3,
  when: (c) => {
    const what = c.rng.pick([
      { k: "carro", t: "O carro quebrou de vez", d: "o motor fundiu no meio da avenida", v: 3500 },
      { k: "casa", t: "Infiltração em casa", d: "a chuva da semana passada abriu uma infiltração no quarto", v: 2500 },
      { k: "familia", t: "Uma emergência na família", d: "um parente próximo precisa de um tratamento que o plano não cobre", v: 5000 },
      { k: "dente", t: "Dor de dente que não espera", d: "o dentista diz que é canal e coroa, e não dá para adiar", v: 2200 },
    ]);
    return { k: what.k, t: what.t, d: what.d, v: c.money(what.v) };
  },
  render: (c, b) => {
    const contact = bestContact(c, 35);
    return {
      title: String(b.t),
      text: `Sem aviso, ${b.d}. A conta: ${brl(Number(b.v))}. Você tem ${brl(c.st.money)} disponíveis.`,
      who: null,
      choices: [
        { id: "pagar", label: "Pagar à vista", tone: "safe", cost: { money: Number(b.v) } },
        { id: "parcelar", label: "Parcelar com juros", hint: "Vira dívida no banco", tone: "neutral" },
        { id: "ajuda", label: contact ? `Pedir ajuda a ${contact.name}` : "Pedir ajuda a um conhecido", hint: "Resolve agora; fica devendo um favor", tone: "risky", requires: () => (contact ? null : "Você não tem ninguém próximo o bastante para pedir.") },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const v = Number(b.v);
    if (choice === "pagar") {
      fx.money(-v, String(b.t));
      return "Pago. Doeu no bolso, mas está resolvido.";
    }
    if (choice === "parcelar") {
      fx.debt(Math.round(v * 1.18));
      return `Parcelado em doze vezes: ${brl(v * 1.18)} no total, somados à sua dívida.`;
    }
    const contact = bestContact(c, 35);
    if (contact) {
      fx.rel(contact.id, -4);
      fx.flag("favor_devido", contact.id);
      fx.schedule("favor_cobrado", [40, 120], { who: contact.id, v });
      return `${contact.name} resolveu na hora: "Depois a gente vê isso." Você sabe que "depois" sempre chega.`;
    }
    fx.debt(Math.round(v * 1.18));
    return "Sem ninguém a quem recorrer, você parcelou com juros.";
  },
  fallback: "parcelar",
};

const favor_cobrado: EventDef = {
  id: "favor_cobrado",
  kind: "DECISAO",
  tags: ["BASTIDORES", "VIDA"],
  chained: true,
  expires: 5,
  when: (c, d) => (actor(c, d?.who) ? d! : null),
  render: (c, b) => {
    const who = actor(c, b.who)!;
    const ask = c.p.office_code
      ? "que você indique um sobrinho dele(a) para um cargo no seu gabinete"
      : c.cand
        ? "que você coloque o nome dele(a) no seu material de campanha como apoio"
        : "que você ajude a divulgar o negócio dele(a) no seu bairro";
    return {
      title: `${first(who)} veio cobrar o favor`,
      who,
      text: `Lembra da ajuda de ${brl(Number(b.v))}? ${who.name} não esqueceu. Agora pede ${ask}. "Amigo é para essas horas, né?"`,
      choices: [
        { id: "atender", label: "Atender o pedido", hint: c.p.office_code ? "Nepotismo cruzado é crime — e pega mal" : "Fica tudo certo entre vocês", tone: c.p.office_code ? "illegal" : "safe" },
        { id: "pagar", label: "Devolver o dinheiro com juros", tone: "safe", cost: { money: Math.round(Number(b.v) * 1.1) } },
        { id: "negar", label: "Negar", hint: "Pode virar inimizade", tone: "risky" },
      ],
    };
  },
  resolve: (c, b, choice, fx) => {
    const who = actor(c, b.who)!;
    fx.unflag("favor_devido");
    if (choice === "atender") {
      fx.rel(who.id, 12);
      if (c.p.office_code) {
        fx.illicit("NEPOTISMO", { amount: c.money(6000), description: `Nomeação de parente de ${who.name} no gabinete`, witnesses: 3, paperTrail: 0.6, partners: [who.id] });
        return "A nomeação saiu no diário oficial. Ninguém perguntou nada — ainda.";
      }
      return `${first(who)} ficou satisfeito(a). Dívida quitada do jeito que se quita na política.`;
    }
    if (choice === "pagar") {
      fx.money(-Math.round(Number(b.v) * 1.1), `Devolução de empréstimo a ${who.name}`);
      fx.rel(who.id, 3);
      return "Você devolveu o dinheiro com juros. Ficou tudo certo — e mais frio.";
    }
    fx.rel(who.id, -25);
    return `${who.name} saiu batendo a porta. Você ganhou um desafeto que conhece sua vida.`;
  },
  fallback: "negar",
};

const pedido_vizinho: EventDef = {
  id: "pedido_vizinho",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE", "VIDA"],
  cooldown: 110,
  expires: 6,
  when: (c) => ({
    need: c.rng.pick([
      "conseguir uma consulta com especialista para a mãe, que espera há oito meses",
      "entender por que o benefício do INSS foi cortado",
      "achar vaga em creche para o filho caçula",
      "recorrer de uma multa que diz ser injusta",
    ]),
    hood: home(c),
  }),
  render: (c, b) => ({
    title: "Uma vizinha bate na sua porta",
    text: `Dona Cida, do ${b.hood}, ouviu dizer que você "conhece gente". Ela precisa ${b.need}. Não é sua obrigação — mas é exatamente esse tipo de coisa que o bairro lembra na hora de votar.`,
    choices: [
      { id: "ajudar", label: "Arregaçar as mangas e ajudar", hint: "Algumas tardes de telefone e fila", tone: "safe", cost: { energy: 12 } },
      { id: "orientar", label: "Explicar o caminho e deixar com ela", tone: "neutral" },
      { id: "prometer", label: "Prometer resolver \"com os contatos\"", hint: "Promessa que precisa ser cumprida", tone: "risky" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "ajudar") {
      fx.energy(-12);
      if (c.roll(0.55 + c.competence * 0.3)) {
        fx.reputation(1.5);
        fx.reach(0.003);
        return "Resolvido. Dona Cida contou para a rua inteira — e a rua inteira contou para mais gente.";
      }
      fx.reputation(0.5);
      return "Não deu para resolver, mas ela viu você tentar. Agradeceu com um bolo de fubá.";
    }
    if (choice === "orientar") return "Você explicou o caminho das pedras. Ela agradeceu, um pouco decepcionada.";
    if (c.roll(0.35 + c.st.political_capital / 150)) {
      fx.reputation(2);
      fx.capital(-2);
      return "Um telefonema certo resolveu tudo. Você gastou um pouco de prestígio — e ganhou uma cabo eleitoral para a vida.";
    }
    fx.reputation(-2);
    return "Os contatos não atenderam. Dona Cida agora conta a história ao contrário: você prometeu e sumiu.";
  },
  fallback: "orientar",
};

// ---------------------------------------------------------------- crises na cidade
const crise_bairro: EventDef = {
  id: "crise_bairro",
  kind: "DECISAO",
  tags: ["COMUNIDADE", "IMPRENSA"],
  weight: 0.9,
  cooldown: 200,
  expires: 3,
  when: (c) => {
    const k = c.rng.pick([
      { k: "enchente", t: "Enchente no {h}", d: "A chuva da madrugada alagou o {h}. Há famílias desalojadas, móveis na calçada e lama até o joelho." },
      { k: "agua", t: "Sem água há cinco dias", d: "O {h} está sem água há cinco dias. A concessionária fala em \"manutenção\"; os moradores falam em descaso." },
      { k: "onibus", t: "Linha de ônibus cortada", d: "A empresa cortou a única linha que atendia o {h}. Trabalhadores agora andam quarenta minutos até o ponto mais próximo." },
    ]);
    const h = c.rng.chance(0.5) ? home(c) : bairro(c, `crise:${c.date.slice(0, 7)}`);
    return { k: k.k, t: k.t.replace("{h}", h), d: k.d.replace("{h}", h), h };
  },
  render: (c, b) => ({
    title: String(b.t),
    text: `${b.d} ${c.p.office_code ? `Como ${c.office?.toLowerCase()}, esperam uma resposta sua.` : "Os grupos do bairro pedem ajuda — e prestam atenção em quem aparece."}`,
    choices: [
      { id: "arrecadar", label: "Organizar uma rede de ajuda", hint: "Muito trabalho, pouco palco", tone: "safe", cost: { energy: 20 } },
      { id: "cobrar", label: "Cobrar o poder público em público", hint: "Visibilidade; rusga com quem governa", tone: "bold", cost: { energy: 10 } },
      { id: "video", label: "Gravar um vídeo no local", hint: "Alcance rápido; pode parecer oportunismo", tone: "risky", cost: { energy: 5 } },
      { id: "nada", label: "Não se envolver", tone: "neutral" },
    ],
  }),
  resolve: (c, b, choice, fx) => {
    if (choice === "arrecadar") {
      fx.energy(-20);
      fx.reputation(2.5);
      fx.activism(5);
      const leader = communityLeader(c, String(b.h));
      fx.rel(leader.id, 8);
      if (c.cand) fx.seg(["informais", "trabalhadores_formais"], 0.03, `rede de ajuda no ${b.h}`);
      return `Você montou uma rede de doações com a associação do ${b.h}. Não saiu no jornal — saiu de boca em boca, que vale mais.`;
    }
    if (choice === "cobrar") {
      fx.energy(-10);
      fx.visibility(3);
      fx.reach(0.008);
      const mayor = localPolitician(c, { office: "PREFEITO" });
      if (mayor) fx.rel(mayor.id, -6);
      if (c.cand) fx.momentum(0.02, `cobrança pública no ${b.h}`);
      return "Sua cobrança foi reproduzida por dois portais locais. A prefeitura prometeu solução \"em breve\".";
    }
    if (choice === "video") {
      fx.energy(-5);
      fx.reach(0.01);
      if (c.roll(0.55 + c.charisma * 0.25)) {
        fx.visibility(3);
        return "O vídeo, com os pés na lama, rodou a cidade. Gente que nunca ouviu falar de você agora sabe quem você é.";
      }
      fx.reputation(-2);
      return "\"Veio só tirar foto\", comentou um morador — e o comentário teve mais curtidas que o vídeo.";
    }
    fx.reputation(-0.5);
    return "Você ficou de fora. O bairro resolveu como pôde.";
  },
  fallback: "nada",
};

// ---------------------------------------------------------------- formação e palco
const palestra_escola: EventDef = {
  id: "palestra_escola",
  kind: "OPORTUNIDADE",
  tags: ["COMUNIDADE"],
  cooldown: 200,
  expires: 10,
  when: (c) => (c.p.visibility >= 8 || c.p.office_code || c.st.activism >= 25 ? { school: c.rng.pick(["Escola Estadual Monteiro Lobato", "Colégio Municipal Anísio Teixeira", "Escola Estadual Cecília Meireles", "o campus da universidade federal"]) } : null),
  render: (c, b) => ({
    title: "Convite para falar a estudantes",
    text: `A ${b.school} convida você para conversar com turmas do ensino médio sobre "por que a política importa". Jovens fazem perguntas que adultos não têm coragem de fazer.`,
    choices: [
      { id: "ir", label: "Aceitar e preparar uma boa conversa", tone: "safe", cost: { energy: 10 } },
      { id: "recusar", label: "Recusar", tone: "neutral" },
    ],
  }),
  resolve: (c, _b, choice, fx) => {
    if (choice === "recusar") return "Ficou para outra ocasião.";
    fx.energy(-10);
    fx.debate(4);
    if (c.roll(0.5 + c.charisma * 0.35)) {
      fx.reputation(1);
      if (c.cand) fx.seg(["jovens_urbanos"], 0.04, "conversa com estudantes");
      return "Uma aluna perguntou se você \"ia mesmo mudar alguma coisa\". Sua resposta virou vídeo no perfil da escola.";
    }
    return "A turma do fundão não largou o celular, mas a da frente encheu você de perguntas. Você saiu com ideias novas.";
  },
  fallback: "recusar",
};

export const BASE_EVENTS: EventDef[] = [
  convite_encontro_politico,
  encontro_sabado,
  evento_comunitario,
  lideranca_local_contato,
  projeto_comunitario,
  projeto_repercute,
  lider_apresenta_partido,
  entrevista_radio,
  post_viral,
  chefe_cobra,
  emprego_volta,
  trabalho_extra,
  despesa_inesperada,
  favor_cobrado,
  pedido_vizinho,
  crise_bairro,
  palestra_escola,
];
