import { diffDays } from "../../calendar";
import { CARS, carValue, homeValue, tierLabel } from "../../housing";
import type { StoryCtx } from "../context";
import type { EventDef } from "../def";
import { NOMES, ev } from "./cotidiano";
import { brl, city, communityLeader } from "./util";

/**
 * A casa e a vizinhança: o que acontece depende de onde e como o personagem mora
 * (com a família, de aluguel, em casa própria, sem casa) e do carro na garagem.
 */

const home = (c: StoryCtx) => c.s.home;
const hood = (c: StoryCtx) => c.s.home?.bairro ?? "bairro";
const kind = (c: StoryCtx) => c.s.home?.kind;

const reajuste_abusivo = ev({
  id: "reajuste_abusivo",
  kind: "DECISAO",
  tags: ["CASA", "DINHEIRO"],
  family: "aluguel",
  cooldown: 300,
  max: 3,
  expires: 6,
  when: (c) => (kind(c) === "ALUGUEL" && diffDays(c.date, home(c)!.since) > 200 ? { pct: c.rng.pick([18, 22, 25, 30]) } : null),
  title: () => "O dono do imóvel quer aumentar o aluguel",
  text: (c, b) => `O proprietário mandou mensagem: quer ${b.pct}% de reajuste, bem acima da inflação, "porque o ${hood(c)} valorizou". O aluguel hoje é ${brl(home(c)!.rent)}.`,
  opts: [
    { id: "negociar", label: "Negociar com base no índice do contrato", hint: "A lei está do seu lado", tone: "safe", cost: () => ({ energy: 5 }), run: (c, _b, fx) => {
      if (c.roll(0.6 + c.charisma * 0.2)) return "Ele aceitou o índice oficial. Contrato é contrato.";
      const h = home(c)!;
      h.rent = Math.round(h.rent * 1.08);
      fx.flag("aluguel_negociado", c.date);
      return `Ficou no meio do caminho: 8% de aumento. Aluguel novo: ${brl(h.rent)}.`;
    } },
    { id: "aceitar", label: "Aceitar para não ter que mudar", tone: "neutral", run: (c, b) => {
      const h = home(c)!;
      h.rent = Math.round(h.rent * (1 + Number(b.pct) / 100));
      return `Aluguel novo: ${brl(h.rent)}. Dói no bolso, mas evita a mudança.`;
    } },
    { id: "procurar", label: "Avisar que vai procurar outro lugar", hint: "Pode blefar — ou ter que mudar", tone: "bold", run: (c) => {
      if (c.roll(0.55)) return "Ele recuou na hora: inquilino que paga em dia vale ouro.";
      const h = home(c)!;
      h.rent = Math.round(h.rent * 1.15);
      return `Ele pagou para ver e você ficou, com 15% a mais (${brl(h.rent)}). Na aba Bens dá para procurar outro lugar.`;
    } },
  ],
  fallback: "aceitar",
});

const infiltracao = ev({
  id: "infiltracao",
  kind: "DECISAO",
  tags: ["CASA", "DINHEIRO"],
  family: "reforma",
  cooldown: 300,
  max: 3,
  expires: 6,
  when: (c) => (kind(c) === "PROPRIA" || kind(c) === "ALUGUEL" ? { onde: c.rng.pick(["no teto do quarto", "na parede da cozinha", "no banheiro", "na sala"]) } : null),
  title: () => "Infiltração em casa",
  text: (_c, b) => `Depois da chuva da semana, apareceu uma mancha de mofo ${b.onde}. O cheiro já tomou a casa.`,
  opts: [
    { id: "consertar", label: "Chamar um profissional e resolver direito", tone: "safe", cost: (c) => ({ money: c.money(kind(c) === "PROPRIA" ? 2800 : 600) }), run: (c) => (kind(c) === "ALUGUEL" ? "O proprietário pagou a maior parte depois de muita conversa. Casa seca de novo." : "Telhado revisado, parede tratada. Dinheiro bem gasto.") },
    { id: "gambiarra", label: "Resolver no improviso", tone: "neutral", cost: (c) => ({ money: c.money(150), energy: 8 }), run: (c, _b, fx) => {
      if (c.roll(0.5)) return "Massa, tinta e fé. Por enquanto, segurou.";
      fx.health(-1.5);
      return "Voltou na chuva seguinte, pior. O mofo pegou na garganta de todo mundo.";
    } },
    { id: "ignorar", label: "Deixar para depois", tone: "risky", run: (_c, _b, fx) => {
      fx.health(-2);
      return "O mofo se espalhou e você passou duas semanas com alergia.";
    } },
  ],
  fallback: "ignorar",
});

const vizinho_festa = ev({
  id: "vizinho_festa",
  kind: "DECISAO",
  tags: ["CASA", "COMUNIDADE"],
  family: "vizinho_conflito",
  cooldown: 200,
  max: 3,
  expires: 3,
  when: (c) => (kind(c) && kind(c) !== "RUA" ? { quem: c.rng.pick(NOMES) } : null),
  title: () => "Som alto às duas da manhã",
  text: (c, b) => `Pela terceira sexta seguida, a casa de ${b.quem} vira baile até de madrugada. ${c.p.office_code || c.p.visibility > 10 ? "E todo mundo da rua sabe quem você é." : ""}`,
  opts: [
    { id: "conversar", label: "Conversar com calma no dia seguinte", tone: "safe", cost: () => ({ energy: 5 }), run: (c, _b, fx) => {
      if (c.roll(0.65)) {
        fx.activism(0.5);
        return "Foi uma conversa boa. Combinaram de baixar o som depois da meia-noite — e você ganhou um eleitor.";
      }
      return "Prometeram baixar. Na sexta seguinte, mesmo volume.";
    } },
    { id: "policia", label: "Chamar a polícia", hint: "Resolve na hora; cria inimizade", tone: "bold", run: (c, _b, fx) => {
      fx.fatigue(-3);
      if (c.p.visibility > 10 || c.p.office_code) {
        fx.reputation(-0.5);
        return "A viatura veio e o som parou. No grupo da rua, alguém escreveu: \"político chamando polícia pra vizinho\".";
      }
      return "A viatura veio e o som parou. O clima na rua azedou.";
    } },
    { id: "aguentar", label: "Colocar tampão no ouvido e aguentar", tone: "neutral", run: (_c, _b, fx) => {
      fx.fatigue(5);
      return "Mais uma noite mal dormida. O cansaço vai somando.";
    } },
  ],
  fallback: "aguentar",
});

const vizinho_pede_emprego = ev({
  id: "vizinho_pede_emprego",
  kind: "DECISAO",
  tags: ["CASA", "MANDATO"],
  family: "vizinho_favor",
  cooldown: 240,
  max: 3,
  expires: 5,
  when: (c) => (c.p.office_code && kind(c) !== "RUA" ? { quem: c.rng.pick(NOMES), filho: c.rng.pick(["o filho", "a filha", "o sobrinho", "a neta"]) } : null),
  title: () => "Batem à sua porta pedindo emprego",
  text: (c, b) => `Domingo de manhã, ${b.quem}, vizinho(a) de anos no ${hood(c)}, aparece com ${b.filho}: "Você agora tem gabinete. Arruma qualquer coisa? Está desempregado(a) há um ano."`,
  opts: [
    { id: "curriculo", label: "Pegar o currículo e indicar para vagas abertas", hint: "Ajuda sem misturar as coisas", tone: "safe", run: (_c, _b, fx) => {
      fx.activism(0.5);
      fx.approval(0.3, "Ajudou um vizinho a procurar emprego");
      return "Você mandou o currículo para três empresas e para o balcão de empregos. Duas semanas depois, veio uma entrevista.";
    } },
    { id: "gabinete", label: "Contratar no gabinete", hint: "Agrada o vizinho; cheira a apadrinhamento", tone: "risky", run: (c, _b, fx) => {
      fx.scandal(2);
      if (c.roll(0.25)) {
        fx.approval(-1.5, "Contratou o filho do vizinho no gabinete");
        fx.news("Gabinete contrata filho de vizinho", `A contratação de um parente de vizinho de ${c.p.name} no gabinete gerou críticas.`);
        return "A contratação vazou para um blog local. Agora todo mundo sabe.";
      }
      return "Contratado. A rua inteira ficou sabendo que \"com você, as coisas acontecem\".";
    } },
    { id: "negar", label: "Explicar que não pode", tone: "neutral", run: () => "Você explicou, com cuidado. Ele saiu chateado, mas entendeu." },
  ],
  fallback: "negar",
});

const gabinete_na_porta = ev({
  id: "gabinete_na_porta",
  kind: "DECISAO",
  tags: ["CASA", "MANDATO"],
  family: "vizinho_favor",
  cooldown: 200,
  max: 3,
  expires: 4,
  when: (c) => (c.p.office_code && (kind(c) === "PROPRIA" || kind(c) === "ALUGUEL" || kind(c) === "FAMILIA") ? {} : null),
  title: () => "Fila na porta de casa",
  text: (c) => `Desde que a eleição acabou, sua casa no ${hood(c)} virou extensão do gabinete: gente pedindo remédio, vaga em creche, ajuda com conta de luz. Hoje havia oito pessoas no portão antes das sete.`,
  opts: [
    { id: "atender", label: "Atender todo mundo, um por um", hint: "Cansa; aprovação no bairro", tone: "safe", cost: () => ({ energy: 15 }), run: (_c, _b, fx) => {
      fx.fatigue(6);
      fx.approval(0.8, "Atendeu moradores na porta de casa");
      return "Três horas de conversa no portão. Nem tudo tem solução, mas todo mundo foi ouvido.";
    } },
    { id: "agenda", label: "Criar um horário fixo de atendimento no gabinete", hint: "Organiza; alguns acham frieza", tone: "neutral", run: (_c, _b, fx) => {
      fx.fatigue(-4);
      return "Plantão às quintas no gabinete. A porta de casa voltou a ser porta de casa.";
    } },
    { id: "mudar", label: "Pensar em se mudar para mais longe", hint: "Paz; distância da base", tone: "bold", run: (_c, _b, fx) => {
      fx.approval(-0.3, "Moradores sentiram você distante");
      return "Você começou a olhar imóveis em outros bairros (aba Bens). O bairro percebeu o recado.";
    } },
  ],
  fallback: "agenda",
});

const condominio_sindico = ev({
  id: "condominio_sindico",
  kind: "OPORTUNIDADE",
  tags: ["CASA", "COMUNIDADE"],
  cooldown: 500,
  max: 2,
  expires: 10,
  when: (c) => ((kind(c) === "PROPRIA" || kind(c) === "ALUGUEL") && (home(c)!.tier ?? 0) >= 2 ? {} : null),
  title: () => "Eleição para síndico",
  text: (c) => `A assembleia do condomínio no ${hood(c)} vai eleger síndico. Os vizinhos olham para você: "Quem faz política lá fora bem que podia fazer aqui dentro."`,
  opts: [
    { id: "candidatar", label: "Se candidatar a síndico(a)", hint: "Treino de política de verdade; muito trabalho", tone: "bold", cost: () => ({ energy: 10 }), run: (c, _b, fx) => {
      if (c.roll(0.6)) {
        fx.flag("sindico", c.date);
        fx.activism(2);
        fx.fatigue(4);
        return "Eleito(a) síndico(a) por 23 a 9. Primeira pauta: o portão eletrônico.";
      }
      return "Perdeu para a vizinha do 302, que prometeu baixar o condomínio. Política é política.";
    } },
    { id: "apoiar", label: "Apoiar outro vizinho", tone: "safe", run: (_c, _b, fx) => {
      fx.activism(0.5);
      return "Você fez campanha discreta para o seu Jorge. Ele ganhou.";
    } },
    { id: "faltar", label: "Não ir à assembleia", tone: "neutral", run: () => "A assembleia aconteceu sem você — e aprovou uma taxa extra." },
  ],
  fallback: "faltar",
});

const familia_pergunta = ev({
  id: "familia_pergunta",
  kind: "DECISAO",
  tags: ["CASA", "VIDA"],
  family: "familia_casa",
  cooldown: 300,
  max: 2,
  expires: 5,
  when: (c) => (kind(c) === "FAMILIA" && c.age >= 26 ? {} : null),
  title: () => "\"E quando é que você vai sair de casa?\"",
  text: (c) => `No almoço de domingo, a pergunta veio na frente de todo mundo. Você tem ${c.age} anos e ${brl(c.st.money)} guardados.`,
  opts: [
    { id: "contribuir", label: "Prometer ajudar mais nas contas", tone: "safe", cost: (c) => ({ money: c.money(500) }), run: () => "O clima melhorou. Por enquanto, ninguém mais tocou no assunto." },
    { id: "procurar", label: "Dizer que vai começar a procurar um lugar", hint: "A aba Bens tem bairros e preços", tone: "bold", run: (_c, _b, fx) => {
      fx.flag("procurando_casa", true);
      return "Você abriu os classificados naquela noite mesmo. Os preços assustam.";
    } },
    { id: "rir", label: "Fazer piada e mudar de assunto", tone: "neutral", run: (_c, _b, fx) => {
      fx.fatigue(2);
      return "Riram. Mas a pergunta vai voltar no Natal.";
    } },
  ],
  fallback: "rir",
});

const parente_ajuda = ev({
  id: "parente_ajuda",
  kind: "DECISAO",
  tags: ["VIDA", "DINHEIRO"],
  family: "familia_dinheiro",
  cooldown: 300,
  max: 3,
  expires: 6,
  when: (c) => (c.st.money > c.money(3000) ? { quem: c.rng.pick(["sua mãe", "seu pai", "uma tia", "seu irmão", "sua avó"]), coisa: c.rng.pick(["um tratamento dentário", "remédios do mês", "o conserto do telhado", "uma dívida no cartão"]) } : null),
  title: (_c, b) => `${String(b.quem).replace(/^./, (x) => x.toUpperCase())} precisa de ajuda`,
  text: (c, b) => `${String(b.quem).replace(/^./, (x) => x.toUpperCase())} ligou meio sem graça: precisa de ${brl(c.money(2500))} para ${b.coisa}.`,
  opts: [
    { id: "ajudar", label: "Ajudar com tudo", tone: "safe", cost: (c) => ({ money: c.money(2500) }), run: (_c, _b, fx) => {
      fx.fatigue(-3);
      return "Você transferiu na hora. Família é família — e a consciência fica leve.";
    } },
    { id: "metade", label: "Ajudar com metade", tone: "neutral", cost: (c) => ({ money: c.money(1250) }), run: () => "Metade agora, o resto se der. Foi recebido com gratidão." },
    { id: "nao", label: "Dizer que não dá agora", tone: "risky", run: (_c, _b, fx) => {
      fx.fatigue(3);
      return "Desligou o telefone com um nó na garganta. O almoço de domingo vai ser estranho.";
    } },
  ],
  fallback: "metade",
});

const carro_roubado = ev({
  id: "carro_roubado",
  kind: "DECISAO",
  tags: ["CASA", "DINHEIRO"],
  family: "carro",
  cooldown: 400,
  max: 2,
  expires: 4,
  when: (c) => (c.s.car ? {} : null),
  title: () => "Seu carro foi levado",
  text: (c) => `Você saiu de uma reunião no centro de ${city(c)} e a vaga estava vazia: o ${CARS[c.s.car!.model].label} foi furtado. O seguro cobre, com franquia.`,
  opts: [
    { id: "seguro", label: "Acionar o seguro e pagar a franquia", tone: "safe", cost: (c) => ({ money: Math.round(carValue(c.ctx.s, c.s.car!, c.date) * 0.06) }), run: (c, _b, fx) => {
      fx.fatigue(4);
      c.s.car!.since = c.date;
      return "Trinta dias de burocracia e um carro equivalente na garagem. Ufa.";
    } },
    { id: "procurar", label: "Rodar a cidade atrás do carro", hint: "Cansa; às vezes acha", tone: "bold", cost: () => ({ energy: 20 }), run: (c, _b, fx) => {
      fx.fatigue(6);
      if (c.roll(0.3)) return "Acharam o carro abandonado num bairro vizinho, sem o som e sem um pneu. Melhor que nada.";
      return "Nada. O seguro ainda vai precisar ser acionado — com franquia.";
    } },
  ],
  fallback: "seguro",
});

const multa_transito = ev({
  id: "multa_transito",
  kind: "DECISAO",
  tags: ["CASA", "DINHEIRO"],
  family: "carro",
  cooldown: 200,
  max: 3,
  expires: 5,
  when: (c) => (c.s.car ? { tipo: c.rng.pick(["excesso de velocidade", "estacionar em local proibido", "avançar o sinal vermelho"]) } : null),
  title: () => "Multa de trânsito",
  text: (c, b) => `Chegou a notificação: ${b.tipo}, com pontos na carteira.${c.p.office_code ? " Um assessor sugere \"resolver\" com um conhecido no Detran." : ""}`,
  opts: [
    { id: "pagar", label: "Pagar com desconto", tone: "safe", cost: (c) => ({ money: c.money(195) }), run: () => "Paga com 40% de desconto no aplicativo. Lição aprendida." },
    { id: "recorrer", label: "Recorrer", hint: "Às vezes cola", tone: "neutral", cost: () => ({ energy: 5 }), run: (c, _b, fx) => {
      if (c.roll(0.3)) return "Recurso aceito: a placa da via estava encoberta.";
      fx.money(-c.money(260), "Multa de trânsito (recurso negado)");
      return "Recurso negado. Pagou sem desconto.";
    } },
    { id: "jeitinho", label: "Deixar o assessor \"resolver\"", hint: "Corrupção: pequena, mas é", tone: "illegal", requires: (c) => (c.p.office_code ? null : "Só quem tem cargo tem esse tipo de \"contato\"."), run: (c, _b, fx) => {
      fx.scandal(2);
      if (c.roll(0.2)) {
        fx.reputation(-2);
        return "O servidor do Detran foi pego numa operação. Seu nome estava na planilha.";
      }
      return "A multa sumiu do sistema. E ficou o rastro de quem pediu.";
    } },
  ],
  fallback: "pagar",
});

const carro_oficina = ev({
  id: "carro_oficina",
  kind: "DECISAO",
  tags: ["CASA", "DINHEIRO"],
  family: "carro",
  cooldown: 250,
  max: 3,
  expires: 5,
  when: (c) => (c.s.car && diffDays(c.date, c.s.car.since) > 365 ? {} : null),
  title: () => "O carro deixou você na mão",
  text: (c) => `O ${CARS[c.s.car!.model].label} morreu no meio do caminho para um compromisso. Guincho, oficina e o diagnóstico: embreagem e correia.`,
  opts: [
    { id: "consertar", label: "Consertar", tone: "safe", cost: (c) => ({ money: c.money(c.s.car!.model === "luxo" ? 9000 : 2200) }), run: () => "Carro de volta em quatro dias, rodando liso." },
    { id: "vender", label: "Vender no estado e pensar em outro", hint: "A aba Bens tem as opções", tone: "neutral", run: (c, _b, fx) => {
      const car = c.s.car!;
      const v = Math.round(carValue(c.ctx.s, car, c.date) * 0.7);
      fx.money(v, "Venda do carro com defeito");
      c.s.car = null;
      return `Vendido no estado por ${brl(v)}. Por enquanto, ônibus e aplicativo.`;
    } },
  ],
  fallback: "consertar",
});

const ostentacao = ev({
  id: "ostentacao",
  kind: "DECISAO",
  tags: ["CASA", "IMPRENSA"],
  family: "imagem_bens",
  cooldown: 365,
  max: 2,
  expires: 5,
  when: (c) => (c.p.office_code && ((home(c)?.kind === "PROPRIA" && home(c)!.tier >= 4) || c.s.car?.model === "luxo") ? { o_que: home(c)?.tier === 4 ? `a casa de luxo no ${hood(c)}` : "o SUV importado" } : null),
  title: () => "Reportagem sobre o seu padrão de vida",
  text: (c, b) => `Um portal publicou fotos de ${b.o_que} ao lado do valor do seu subsídio. Os comentários estão pesados.`,
  opts: [
    { id: "explicar", label: "Mostrar a declaração de bens e a origem do dinheiro", hint: "Transparência", tone: "safe", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      fx.approval(-0.5, "Reportagem sobre padrão de vida");
      return c.st.dirty_money > 0 ? "A declaração bate — no papel. Um jornalista promete continuar olhando." : "Os números batem. A história perdeu fôlego em dois dias.";
    } },
    { id: "vender", label: "Vender e anunciar que vai viver de forma mais simples", hint: "Gesto forte", tone: "bold", run: (_c, _b, fx) => {
      fx.approval(1.5, "Anunciou vida mais simples");
      fx.reputation(1);
      return "O anúncio teve repercussão positiva. Agora é cumprir (as vendas ficam na aba Bens).";
    } },
    { id: "atacar", label: "Atacar o portal", tone: "risky", run: (_c, _b, fx) => {
      fx.approval(-2, "Atacou a imprensa por reportagem sobre bens");
      fx.visibility(1);
      return "A briga com o portal rendeu mais três matérias.";
    } },
  ],
  fallback: "explicar",
});

const mora_no_bairro = ev({
  id: "mora_no_bairro",
  kind: "OPORTUNIDADE",
  tags: ["CASA", "IMPRENSA"],
  family: "imagem_bens",
  cooldown: 400,
  max: 1,
  expires: 7,
  when: (c) => (c.p.office_code && (home(c)?.kind === "ALUGUEL" || home(c)?.kind === "FAMILIA" || (home(c)?.tier ?? 9) <= 1) ? {} : null),
  title: () => "Uma rádio quer conhecer sua casa",
  text: (c) => `A rádio local descobriu que você continua morando no ${hood(c)}, numa casa simples, e quer fazer uma reportagem: "o político que não saiu do bairro".`,
  opts: [
    { id: "aceitar", label: "Abrir a porta para a reportagem", tone: "bold", run: (_c, _b, fx) => {
      fx.approval(1.5, "Reportagem mostrou que continua no bairro");
      fx.visibility(1);
      return "A matéria emocionou. Muita gente se reconheceu na sua cozinha.";
    } },
    { id: "recusar", label: "Preferir a privacidade", tone: "neutral", run: () => "Você agradeceu e preservou a família." },
  ],
  fallback: "recusar",
});

const rua_noite = ev({
  id: "rua_noite",
  kind: "DECISAO",
  tags: ["CASA", "SAUDE"],
  family: "rua",
  cooldown: 25,
  expires: 3,
  when: (c) => (kind(c) === "RUA" ? { frio: c.rng.chance(0.5) ? 1 : 0 } : null),
  title: (_c, b) => (Number(b.frio) ? "Uma noite fria sem teto" : "Mais uma noite na rua"),
  text: (c) => `Sem casa há ${diffDays(c.date, home(c)!.since)} dias. ${c.p.visibility > 10 ? "Algumas pessoas reconhecem você e cochicham." : "O corpo já sente."}`,
  opts: [
    { id: "albergue", label: "Procurar o albergue municipal", tone: "safe", run: (_c, _b, fx) => {
      fx.health(0.5);
      fx.fatigue(-4);
      return "Uma cama, um banho e um prato de sopa. Amanhã é outro dia.";
    } },
    { id: "amigo", label: "Pedir o sofá de um amigo", hint: "Uma noite de alívio", tone: "neutral", run: (c, _b, fx) => {
      if (c.roll(0.6)) {
        fx.fatigue(-8);
        fx.health(1);
        return "O amigo abriu a porta sem fazer perguntas. Você dormiu de verdade.";
      }
      fx.fatigue(3);
      return "Ninguém atendeu. A noite foi longa.";
    } },
    { id: "familia", label: "Engolir o orgulho e voltar para a família", hint: "Sai da rua hoje", tone: "bold", run: (c, _b, fx) => {
      const h = home(c)!;
      c.s.home = { ...h, kind: "FAMILIA", bairro: c.s.family_bairro ?? h.bairro, tier: 2, since: c.date };
      fx.health(2);
      fx.fatigue(-10);
      return "A porta abriu com abraço e lágrima. Você está de volta debaixo de um teto.";
    } },
  ],
  fallback: "albergue",
});

const rua_reconhecido = ev({
  id: "rua_reconhecido",
  kind: "OPORTUNIDADE",
  tags: ["CASA", "IMPRENSA"],
  family: "rua",
  cooldown: 120,
  max: 2,
  expires: 5,
  when: (c) => (kind(c) === "RUA" && (c.p.visibility > 6 || c.p.office_code || c.p.party_id) ? {} : null),
  title: () => "Um jornalista descobriu que você está sem casa",
  text: () => "Ele quer publicar. Pode virar humilhação — ou uma história sobre o que é estar na rua.",
  opts: [
    { id: "contar", label: "Dar entrevista e contar a verdade", hint: "Pode gerar empatia", tone: "bold", run: (c, _b, fx) => {
      if (c.roll(0.5)) {
        fx.reputation(1);
        fx.visibility(2);
        return "A entrevista comoveu. Gente da cidade se ofereceu para ajudar.";
      }
      fx.reputation(-2);
      return "A manchete foi cruel. Os comentários, piores.";
    } },
    { id: "nao", label: "Pedir que não publique", tone: "neutral", run: (c, _b, fx) => {
      if (c.roll(0.5)) return "Ele segurou a matéria. Por enquanto.";
      fx.reputation(-1.5);
      return "Publicou assim mesmo, com foto. O assunto correu a cidade.";
    } },
  ],
  fallback: "nao",
});

const vizinha_associacao = ev({
  id: "vizinha_associacao",
  kind: "OPORTUNIDADE",
  tags: ["CASA", "COMUNIDADE"],
  cooldown: 300,
  max: 2,
  expires: 8,
  when: (c) => (kind(c) && kind(c) !== "RUA" && !c.p.office_code ? {} : null),
  who: (c) => communityLeader(c, hood(c)),
  title: (c) => `Reunião da associação do ${hood(c)}`,
  text: (c) => `${communityLeader(c, hood(c)).name} convidou você para a reunião mensal da associação do ${hood(c)}: buraco, ônibus, segurança. "Quem mora aqui tem que participar."`,
  opts: [
    { id: "ir", label: "Ir e levar uma proposta", tone: "safe", cost: () => ({ energy: 10 }), run: (c, _b, fx) => {
      fx.activism(3);
      fx.rel(communityLeader(c, hood(c)).id, 6);
      fx.reach(0.002);
      return "Você saiu de lá com a missão de cobrar a prefeitura pelo ponto de ônibus. E com o respeito da vizinhança.";
    } },
    { id: "ouvir", label: "Ir só para ouvir", tone: "neutral", cost: () => ({ energy: 5 }), run: (_c, _b, fx) => {
      fx.activism(1);
      return "Duas horas de reclamação justa. Você anotou tudo.";
    } },
    { id: "nao", label: "Não ir", tone: "neutral", run: () => "A reunião aconteceu sem você." },
  ],
  fallback: "nao",
});

const casa_valorizou = ev({
  id: "casa_valorizou",
  kind: "INFO",
  tags: ["CASA", "DINHEIRO"],
  cooldown: 500,
  max: 2,
  when: (c) => (home(c)?.kind === "PROPRIA" && diffDays(c.date, home(c)!.since) > 700 ? {} : null),
  title: () => "Corretor bate à porta",
  text: (c) => `Um corretor deixou o cartão: "Tenho comprador para imóveis no ${hood(c)}." Pela avaliação dele, sua casa vale ${brl(homeValue(c.ctx.s, home(c)!))} (${tierLabel(home(c)!.tier)}).`,
  opts: [{ id: "ok", label: "Guardar o cartão", run: () => "Bom saber quanto vale o que é seu." }],
  fallback: "ok",
});

export const HOME_EVENTS: EventDef[] = [
  reajuste_abusivo,
  infiltracao,
  vizinho_festa,
  vizinho_pede_emprego,
  gabinete_na_porta,
  condominio_sindico,
  familia_pergunta,
  parente_ajuda,
  carro_roubado,
  multa_transito,
  carro_oficina,
  ostentacao,
  mora_no_bairro,
  rua_noite,
  rua_reconhecido,
  vizinha_associacao,
  casa_valorizou,
];
