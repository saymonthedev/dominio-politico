import type { StoryCtx } from "../context";
import type { EventDef } from "../def";
import { partyLeader } from "../world";
import { AMIGOS, ev, NOMES } from "./cotidiano";
import { brl, city, home, localPolitician } from "./util";

/**
 * Escolhas de toda a carreira: a rua da campanha, o gabinete do mandato, a
 * vida dentro do partido, a vida pessoal e os bastidores. Quase todas são
 * decisões (o tempo espera) com três ou quatro caminhos e consequências.
 */

const emCampanha = (c: StoryCtx) => c.phase === "CAMPANHA" || c.phase === "RETA_FINAL" || c.phase === "SEGUNDO_TURNO";
const naRua = (c: StoryCtx) => c.phase === "CAMPANHA" || c.phase === "RETA_FINAL";
const preCampanha = (c: StoryCtx) => c.phase === "PRE" || c.phase === "CONVENCAO";
const lider = (c: StoryCtx) => (c.party ? partyLeader(c.ctx, c.p, c.party) : undefined);

// ================================================================ campanha

const carro_de_som = ev({
  id: "esc_carro_de_som",
  kind: "DECISAO",
  tags: ["CAMPANHA", "COMUNIDADE"],
  cooldown: 400,
  expires: 3,
  when: (c) => (naRua(c) ? { hood: home(c) } : null),
  title: () => "Reclamação do carro de som",
  text: (_c, b) => `Moradores do ${b.hood} reclamam que o seu carro de som passa às sete da manhã de domingo, no último volume. Um vídeo de um senhor de pijama xingando o jingle já roda nos grupos.`,
  opts: [
    { id: "manter", label: "Manter: campanha é barulho mesmo", tone: "bold", run: (_c, _b, fx) => {
      fx.momentum(0.01, "carro de som nas ruas");
      fx.seg(["aposentados"], -0.03, "barulho no domingo");
      return "O jingle grudou na cabeça do bairro — e a irritação também.";
    } },
    { id: "horario", label: "Mudar o horário e pedir desculpas", tone: "safe", run: (_c, _b, fx) => {
      fx.seg(["aposentados", "classe_media"], 0.015, "respeito ao bairro");
      fx.reputation(0.5);
      return "Você gravou um pedido de desculpas bem-humorado. O senhor de pijama virou eleitor.";
    } },
    { id: "tirar", label: "Tirar o carro das ruas e investir em redes", tone: "neutral", run: (_c, _b, fx) => {
      fx.momentum(-0.005);
      fx.seg(["jovens_urbanos"], 0.02, "campanha nas redes");
      return "Menos barulho, mais celular. O bairro dormiu em paz.";
    } },
  ],
  fallback: "manter",
});

const culto = ev({
  id: "esc_convite_culto",
  kind: "DECISAO",
  tags: ["CAMPANHA", "COMUNIDADE"],
  cooldown: 400,
  expires: 3,
  when: (c) => (naRua(c) ? { igreja: c.rng.pick(["Assembleia do bairro", "Igreja Batista da avenida", "Comunidade Renovada", "Igreja do Evangelho Pleno"]) } : null),
  title: () => "Convite para falar no culto",
  text: (_c, b) => `O pastor da ${b.igreja} convidou você para "dar uma palavra" no culto de domingo. Mil e quinhentas pessoas. A lei proíbe propaganda eleitoral dentro do templo — mas o pastor diz que "todo mundo faz".`,
  opts: [
    { id: "valores", label: "Falar de família e trabalho, sem pedir voto", hint: "Dentro da lei", tone: "safe", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      fx.seg(["evangelicos"], 0.035, "palavra no culto");
      return c.roll(0.6) ? "Você falou de fé e de trabalho. Na saída, fila para tirar foto." : "Respeitoso, mas morno. Ninguém saiu dali com o seu número na cabeça.";
    } },
    { id: "voto", label: "Pedir voto do púlpito", hint: "Propaganda em templo é proibida", tone: "risky", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      fx.seg(["evangelicos"], 0.06, "pedido de voto no culto");
      if (c.roll(0.45)) {
        fx.rumor(4);
        fx.scandal(4);
        fx.news("Candidato(a) pede voto em culto", "Vídeo mostra pedido de voto dentro de templo; adversários acionam a Justiça Eleitoral.");
        return "O vídeo do púlpito foi parar no Ministério Público Eleitoral. Multa e manchete negativa.";
      }
      return "A igreja respondeu com aplausos. Por sorte, ninguém filmou.";
    } },
    { id: "recusar", label: "Recusar com educação", tone: "neutral", run: (_c, _b, fx) => {
      fx.seg(["evangelicos"], -0.01);
      return "O pastor entendeu. Seu adversário foi no seu lugar.";
    } },
  ],
  fallback: "recusar",
});

const sindicato = ev({
  id: "esc_sindicato_compromisso",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  cooldown: 400,
  expires: 4,
  when: (c) => (naRua(c) ? { cat: c.rng.pick(["dos comerciários", "dos metalúrgicos", "dos professores", "dos motoristas de ônibus"]) } : null),
  title: (_c, b) => `O sindicato ${b.cat} quer um compromisso`,
  text: (_c, b) => `O sindicato ${b.cat} oferece apoio, carro de som e mil filiados na rua — se você assinar uma carta contra a reforma que eles combatem. Os empresários da cidade estão de olho.`,
  opts: [
    { id: "assinar", label: "Assinar a carta", tone: "bold", run: (c, b, fx) => {
      fx.seg(["trabalhadores_formais"], 0.05, `apoio do sindicato ${b.cat}`);
      fx.seg(["classe_media"], -0.015);
      fx.volunteers(25);
      fx.promise(`Defender os trabalhadores ${String(b.cat).replace(/^dos /, "")}`, "trabalhadores_formais");
      return "Carta assinada, filiados na rua. O comércio torceu o nariz.";
    } },
    { id: "conversar", label: "Apoiar a pauta, sem assinar nada", tone: "safe", run: (_c, _b, fx) => {
      fx.seg(["trabalhadores_formais"], 0.02, "conversa com o sindicato");
      return "Apoio morno dos dois lados. Ninguém ficou contra você.";
    } },
    { id: "recusar", label: "Recusar e defender a reforma", tone: "risky", run: (_c, _b, fx) => {
      fx.seg(["classe_media", "agro"], 0.025, "posição firme na reforma");
      fx.seg(["trabalhadores_formais"], -0.04);
      return "Você ganhou os empresários e um sindicato inteiro contra você.";
    } },
  ],
  fallback: "conversar",
});

const jantar_adesao = ev({
  id: "esc_jantar_adesao",
  kind: "DECISAO",
  tags: ["CAMPANHA", "DINHEIRO", "BASTIDORES"],
  cooldown: 400,
  expires: 3,
  when: (c) => (emCampanha(c) ? { v: c.money(c.proportional ? 25_000 : 80_000) } : null),
  title: () => "Jantar de adesão com empresários",
  text: (_c, b) => `Num jantar fechado, um grupo de empresários promete ${brl(Number(b.v))} para a reta final. Um deles chama você no canto: "Metade a gente faz pelo caminho oficial. A outra metade é melhor não aparecer, né?"`,
  opts: [
    { id: "oficial", label: "Aceitar só o que for declarado", tone: "safe", run: (_c, b, fx) => {
      fx.donation(Math.round(Number(b.v) / 2), "Doações de empresários (declaradas)");
      return "Metade do dinheiro entrou, com recibo. A outra metade foi embora com o empresário.";
    } },
    { id: "tudo", label: "Aceitar tudo, inclusive por fora", tone: "illegal", run: (c, b, fx) => {
      fx.donation(Math.round(Number(b.v) / 2), "Doações de empresários (declaradas)");
      fx.dirty(Math.round(Number(b.v) / 2));
      fx.momentum(0.02, "dinheiro para a reta final");
      fx.illicit("CAIXA_DOIS", { amount: Math.round(Number(b.v) / 2), description: "Recursos não declarados de empresários em jantar de adesão", witnesses: 4, paperTrail: 0.35 });
      return c.roll(0.5) ? "Dinheiro na mão e propaganda na rua. Um dos garçons viu o envelope." : "Ninguém viu nada. Por enquanto.";
    } },
    { id: "recusar", label: "Recusar e ir embora", tone: "neutral", run: (_c, _b, fx) => {
      fx.reputation(0.5);
      return "Você saiu antes da sobremesa. A campanha segue apertada — e limpa.";
    } },
  ],
  fallback: "oficial",
});

const pede_dinheiro = ev({
  id: "esc_eleitor_pede_dinheiro",
  kind: "DECISAO",
  tags: ["CAMPANHA", "COMUNIDADE"],
  cooldown: 400,
  expires: 2,
  when: (c) => (naRua(c) ? { quem: c.rng.pick(NOMES), n: c.rng.pick([8, 12, 20]) } : null),
  title: () => "Votos à venda",
  text: (_c, b) => `${b.quem} chega com uma lista: "${b.n} votos aqui da família. Cem reais cada, e o dia está garantido." Seu coordenador de rua cochicha que "todo mundo faz".`,
  opts: [
    { id: "recusar", label: "Recusar e explicar por quê", tone: "safe", run: (_c, _b, fx) => {
      fx.reputation(0.8);
      fx.seg(["informais"], -0.01);
      return "Você explicou que compra de voto é crime e que prefere perder honesto. A família ficou de pensar.";
    } },
    { id: "denunciar", label: "Denunciar ao Ministério Público Eleitoral", tone: "bold", run: (c, _b, fx) => {
      fx.reputation(1);
      fx.visibility(1.5);
      return c.roll(0.5) ? "A denúncia virou notícia: \"candidato(a) denuncia oferta de venda de votos\". Pontos com quem lê jornal." : "O MP registrou a denúncia. No bairro, você ganhou fama de dedo-duro.";
    } },
    { id: "pagar", label: "Pagar pelos votos", hint: "Compra de votos é crime eleitoral", tone: "illegal", run: (c, b, fx) => {
      const v = Number(b.n) * c.money(100);
      fx.money(-v, "Pagamentos a eleitores");
      fx.illicit("COMPRA_VOTOS", { amount: v, description: `Pagamento a eleitores (${b.n} votos)`, witnesses: Number(b.n), paperTrail: 0.15, votesGain: Number(b.n) });
      return "O dinheiro trocou de mão. Agora há muita gente que sabe disso.";
    } },
  ],
  fallback: "recusar",
});

const video_falso = ev({
  id: "esc_video_falso",
  kind: "DECISAO",
  tags: ["CAMPANHA", "IMPRENSA"],
  cooldown: 400,
  expires: 2,
  when: (c) => (emCampanha(c) ? { tema: c.rng.pick(["defendendo o fim de um programa social", "xingando eleitores do interior", "prometendo cargo a parentes"]) } : null),
  title: () => "Um vídeo falso seu está circulando",
  text: (_c, b) => `Um vídeo editado mostra você ${b.tema}. É montagem — mas já tem cem mil visualizações e o seu número na legenda.`,
  opts: [
    { id: "justica", label: "Pedir direito de resposta na Justiça", tone: "safe", run: (c, _b, fx) => {
      fx.campaignSpend(c.money(8_000), "Advogados: direito de resposta", "juridico");
      fx.rumor(-3);
      fx.momentum(0.01, "direito de resposta");
      return "A Justiça mandou tirar o vídeo e garantiu sua resposta. Demorou três dias — três dias longos.";
    } },
    { id: "live", label: "Fazer uma live desmontando a farsa", tone: "bold", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      if (c.roll(0.4 + c.charisma * 0.4)) {
        fx.momentum(0.025, "live contra a farsa");
        fx.rumor(-2);
        return "Quadro a quadro, você mostrou a edição. A live teve mais alcance que o vídeo falso.";
      }
      fx.rumor(1);
      return "A live ficou longa e confusa. Quem viu o vídeo não viu a explicação.";
    } },
    { id: "ignorar", label: "Ignorar: responder dá mais alcance", tone: "risky", run: (_c, _b, fx) => {
      fx.rumor(3);
      fx.momentum(-0.015, "vídeo falso sem resposta");
      return "O vídeo continuou rodando. Silêncio, às vezes, parece confissão.";
    } },
  ],
  fallback: "ignorar",
});

const radio_comunitaria = ev({
  id: "esc_debate_radio",
  kind: "DECISAO",
  tags: ["CAMPANHA", "DEBATE"],
  cooldown: 400,
  expires: 3,
  when: (c) => (naRua(c) ? { radio: c.rng.pick(["Rádio Comunitária Vila Nova", "Rádio Liberdade FM", "Rádio Nossa Voz"]) } : null),
  title: (_c, b) => `Debate na ${b.radio}`,
  text: (c, b) => `A ${b.radio} chamou os candidatos para um debate às 7h. Pouca gente ouve — mas quem ouve é quem mais vota em ${city(c)}. Seus adversários confirmaram.`,
  opts: [
    { id: "preparado", label: "Ir preparado(a), com números na mão", tone: "safe", cost: () => ({ energy: 12 }), run: (c, _b, fx) => {
      fx.debate(3);
      if (c.roll(0.45 + c.competence * 0.35)) {
        fx.momentum(0.02, "bom debate na rádio");
        fx.seg(["aposentados", "informais"], 0.02);
        return "Você foi o(a) único(a) que respondeu com números. O locutor elogiou no ar.";
      }
      return "Debate equilibrado. Você não ganhou, mas também não perdeu.";
    } },
    { id: "ataque", label: "Ir para o ataque", tone: "bold", cost: () => ({ energy: 10 }), run: (c, _b, fx) => {
      if (c.roll(0.5)) {
        fx.momentum(0.025, "ataque no debate da rádio");
        return "Você encurralou um adversário ao vivo. O trecho virou corte nas redes.";
      }
      fx.momentum(-0.015, "tom agressivo na rádio");
      return "O ataque soou grosseiro. Ouvintes ligaram reclamando.";
    } },
    { id: "faltar", label: "Mandar um representante", tone: "neutral", run: (_c, _b, fx) => {
      fx.momentum(-0.01, "ausência no debate");
      return "Cadeira vazia com o seu nome. Os adversários adoraram.";
    } },
  ],
  fallback: "faltar",
});

const marqueteiro = ev({
  id: "esc_marqueteiro",
  kind: "OPORTUNIDADE",
  tags: ["CAMPANHA", "DINHEIRO"],
  cooldown: 400,
  expires: 5,
  when: (c) => (emCampanha(c) ? { v: c.money(c.proportional ? 30_000 : 120_000) } : null),
  title: () => "Um marqueteiro de renome bate à porta",
  text: (_c, b) => `Um marqueteiro que já elegeu dois governadores oferece os serviços por ${brl(Number(b.v))} até o fim da campanha. Garante "virar o jogo". Sua equipe atual é de voluntários.`,
  opts: [
    { id: "contratar", label: "Contratar o marqueteiro", tone: "bold", run: (c, b, fx) => {
      fx.campaignSpend(Number(b.v), "Marketing político", "equipe");
      fx.momentum(c.roll(0.6) ? 0.04 : 0.015, "marqueteiro profissional");
      return "Vídeos de cinema, slogan novo, roteiro afiado. A campanha mudou de patamar — e de custo.";
    } },
    { id: "freela", label: "Contratar um freelancer barato", tone: "safe", run: (c, _b, fx) => {
      fx.campaignSpend(c.money(4_000), "Produção de vídeos", "propaganda");
      fx.momentum(0.01, "vídeos melhores");
      return "Um estudante de cinema topou. Os vídeos melhoraram bastante.";
    } },
    { id: "voluntarios", label: "Seguir com os voluntários", tone: "neutral", run: (_c, _b, fx) => {
      fx.volunteers(5);
      return "A campanha segue artesanal. Tem gente que gosta disso.";
    } },
  ],
  fallback: "voluntarios",
});

const acordo_adversario = ev({
  id: "esc_acordo_adversario",
  kind: "DECISAO",
  tags: ["CAMPANHA", "BASTIDORES"],
  cooldown: 400,
  expires: 3,
  when: (c) => {
    if (!emCampanha(c)) return null;
    const rival = localPolitician(c, { exclude: [c.p.id] });
    return rival ? { rival: rival.id, nome: rival.name } : null;
  },
  title: () => "Proposta de trégua",
  text: (_c, b) => `${b.nome} mandou um recado: "Vamos parar de nos atacar até o fim da campanha. Quem ganha com essa briga são os outros." É uma trégua — ou uma armadilha.`,
  opts: [
    { id: "aceitar", label: "Aceitar a trégua", tone: "safe", run: (_c, b, fx) => {
      fx.rel(String(b.rival), 10);
      fx.rumor(-1);
      return "Trégua selada com um aperto de mão discreto. A campanha ficou mais leve.";
    } },
    { id: "recusar", label: "Recusar: a disputa é para valer", tone: "bold", run: (_c, b, fx) => {
      fx.rel(String(b.rival), -6);
      fx.momentum(0.01, "campanha combativa");
      return "Recado devolvido: \"Nos vemos nas urnas.\"";
    } },
    { id: "vazar", label: "Vazar a proposta para a imprensa", tone: "risky", run: (c, b, fx) => {
      fx.rel(String(b.rival), -20);
      if (c.roll(0.55)) {
        fx.momentum(0.025, "expôs acordo de bastidor");
        return "\"Candidato propõe acordo secreto\" — a manchete pegou o adversário de jeito.";
      }
      fx.reputation(-1);
      return "A imprensa achou a história pequena — e você ficou com fama de quem vaza conversa.";
    } },
  ],
  fallback: "recusar",
});

const pesquisa_rua = ev({
  id: "esc_pesquisa_rua",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  cooldown: 400,
  expires: 3,
  when: (c) => (naRua(c) ? {} : null),
  title: () => "Onde gastar as últimas semanas",
  text: () => "Sua coordenação fez uma pesquisa de rua: você está bem entre quem já conhece você, mas sumiu em três grupos. Dá para focar em um só até o fim.",
  opts: [
    { id: "jovens", label: "Jovens: redes, universidades, festas", tone: "neutral", run: (_c, _b, fx) => {
      fx.seg(["jovens_urbanos"], 0.05, "foco nos jovens");
      return "Vídeos curtos, palestras e um show de rap no fim de semana. Os jovens começaram a falar de você.";
    } },
    { id: "aposentados", label: "Aposentados: feiras, igrejas, postos de saúde", tone: "neutral", run: (_c, _b, fx) => {
      fx.seg(["aposentados"], 0.05, "foco nos aposentados");
      return "Café com bolo em cada praça. Os aposentados votam — e convencem a família.";
    } },
    { id: "informais", label: "Trabalhadores informais: terminais e comércio de rua", tone: "neutral", run: (_c, _b, fx) => {
      fx.seg(["informais"], 0.05, "foco nos informais");
      return "Madrugadas nos terminais de ônibus. Quem pega o primeiro ônibus lembrou de você.";
    } },
  ],
  fallback: "jovens",
});

const voluntarios_briga = ev({
  id: "esc_voluntarios_briga",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  cooldown: 400,
  expires: 2,
  when: (c) => (naRua(c) ? { a: c.rng.pick(AMIGOS), b: c.rng.pick(NOMES) } : null),
  title: () => "Briga na equipe",
  text: (_c, b) => `${b.a} e ${b.b}, dois dos seus voluntários mais dedicados, brigaram feio por causa da escala da panfletagem. Metade da equipe ficou de um lado, metade do outro.`,
  opts: [
    { id: "mediar", label: "Sentar os dois e resolver", tone: "safe", cost: () => ({ energy: 6 }), run: (c, _b, fx) => {
      if (c.roll(0.6 + c.charisma * 0.3)) return "Uma pizza e duas horas depois, os dois se abraçaram. A equipe saiu mais unida.";
      fx.volunteers(-6);
      return "A conversa não colou. Alguns voluntários foram embora.";
    } },
    { id: "afastar", label: "Afastar o mais exaltado", tone: "bold", run: (_c, _b, fx) => {
      fx.volunteers(-4);
      return "Você cortou o problema pela raiz. Doeu, mas a equipe voltou a funcionar.";
    } },
    { id: "ignorar", label: "Deixar que se resolvam sozinhos", tone: "risky", run: (_c, _b, fx) => {
      fx.volunteers(-10);
      fx.momentum(-0.01, "equipe rachada");
      return "A briga contaminou o grupo. Panfletos ficaram encalhados no comitê.";
    } },
  ],
  fallback: "ignorar",
});

const celebridade = ev({
  id: "esc_celebridade_local",
  kind: "OPORTUNIDADE",
  tags: ["CAMPANHA", "IMPRENSA"],
  cooldown: 400,
  expires: 4,
  when: (c) => (emCampanha(c) ? { quem: c.rng.pick(["um cantor sertanejo da cidade", "um ex-jogador de futebol famoso", "uma influenciadora de culinária", "um humorista local"]) } : null),
  title: () => "Uma celebridade quer apoiar você",
  text: (_c, b) => `${String(b.quem)[0].toUpperCase()}${String(b.quem).slice(1)} se ofereceu para gravar um vídeo de apoio. Tem um milhão de seguidores — e algumas polêmicas antigas.`,
  opts: [
    { id: "aceitar", label: "Aceitar e divulgar com força", tone: "bold", run: (c, _b, fx) => {
      fx.momentum(0.03, "apoio de celebridade");
      fx.seg(["jovens_urbanos", "informais"], 0.02);
      if (c.roll(0.3)) {
        fx.rumor(2);
        return "O vídeo bombou — e trouxe junto as polêmicas antigas do apoiador. Você passou um dia se explicando.";
      }
      return "O vídeo bombou. Gente que nunca ligou para política agora sabe seu número.";
    } },
    { id: "discreto", label: "Aceitar, mas sem alarde", tone: "safe", run: (_c, _b, fx) => {
      fx.momentum(0.01, "apoio discreto");
      return "Um story simpático, sem estardalhaço. Ajudou um pouco, sem risco.";
    } },
    { id: "recusar", label: "Agradecer e recusar", tone: "neutral", run: () => "Você preferiu não misturar as coisas. A celebridade apoiou outro candidato." },
  ],
  fallback: "discreto",
});

const agenda_dupla = ev({
  id: "esc_agenda_dupla",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  cooldown: 400,
  expires: 2,
  when: (c) => (naRua(c) ? { hood: home(c) } : null),
  title: () => "Duas agendas no mesmo horário",
  text: (_c, b) => `A equipe marcou, no mesmo sábado, um almoço com a associação comercial no centro e uma caminhada no ${b.hood}, onde você começou. Não dá para estar nos dois.`,
  opts: [
    { id: "centro", label: "Almoço com os comerciantes", tone: "neutral", run: (c, _b, fx) => {
      fx.seg(["classe_media"], 0.035, "almoço com o comércio");
      fx.donation(c.money(3_000), "Doações do comércio local");
      return "Apertos de mão, cartões de visita e algumas doações. O bairro reparou na sua ausência.";
    } },
    { id: "bairro", label: "Caminhada no seu bairro", tone: "safe", run: (_c, _b, fx) => {
      fx.seg(["informais", "trabalhadores_formais"], 0.035, "caminhada nas raízes");
      fx.volunteers(8);
      return "Você voltou às origens. Vizinhos de infância viraram cabos eleitorais.";
    } },
    { id: "dividir", label: "Tentar passar rápido nos dois", tone: "risky", cost: () => ({ energy: 14 }), run: (c, _b, fx) => {
      if (c.roll(0.5)) {
        fx.seg(["classe_media", "informais"], 0.02);
        return "Correria, mas deu certo: meia hora em cada lugar e todo mundo satisfeito.";
      }
      fx.seg(["classe_media", "informais"], -0.01);
      return "Chegou atrasado(a) nos dois. Os dois lados se sentiram de segunda classe.";
    } },
  ],
  fallback: "bairro",
});

const jingle = ev({
  id: "esc_jingle",
  kind: "DECISAO",
  tags: ["CAMPANHA"],
  cooldown: 400,
  expires: 3,
  when: (c) => (c.phase === "CAMPANHA" ? {} : null),
  title: () => "Qual vai ser o seu jingle?",
  text: () => "O estúdio mandou três versões do jingle. A que você escolher vai tocar em todo carro de som, toda live e toda carreata até o dia da eleição.",
  opts: [
    { id: "festa", label: "Forró animado, para cantar junto", tone: "neutral", run: (_c, _b, fx) => {
      fx.seg(["informais", "aposentados"], 0.025, "jingle animado");
      return "Em uma semana, criança cantava o jingle no recreio.";
    } },
    { id: "forte", label: "Hino forte, de mudança", tone: "bold", run: (_c, _b, fx) => {
      fx.momentum(0.015, "jingle de mudança");
      fx.seg(["jovens_urbanos"], 0.015);
      return "Arrepiou a militância. Nas carreatas, parecia final de campeonato.";
    } },
    { id: "serio", label: "Voz calma, sem musiquinha", tone: "safe", run: (_c, _b, fx) => {
      fx.seg(["classe_media"], 0.025, "tom sério");
      return "Sóbrio, quase um telejornal. Quem gosta de seriedade gostou.";
    } },
  ],
  fallback: "festa",
});

const ultimo_debate = ev({
  id: "esc_ultimo_debate",
  kind: "DECISAO",
  tags: ["CAMPANHA", "DEBATE"],
  cooldown: 400,
  expires: 2,
  when: (c) => (c.phase === "SEGUNDO_TURNO" || (c.phase === "RETA_FINAL" && !c.proportional) ? {} : null),
  title: () => "A estratégia para o último debate",
  text: () => "É o último debate antes da votação, ao vivo, em horário nobre. Sua equipe está dividida: atacar o adversário, apresentar propostas ou jogar na defesa e não errar.",
  opts: [
    { id: "atacar", label: "Atacar", tone: "risky", cost: () => ({ energy: 10 }), run: (c, _b, fx) => {
      if (c.roll(0.45 + c.charisma * 0.3)) {
        fx.momentum(0.05, "venceu o último debate no ataque");
        return "Você colocou o adversário contra a parede. Os cortes dominaram a noite.";
      }
      fx.momentum(-0.03, "ataque mal recebido no último debate");
      return "O ataque pareceu desespero. O adversário saiu como vítima.";
    } },
    { id: "propostas", label: "Propostas", tone: "safe", cost: () => ({ energy: 10 }), run: (c, _b, fx) => {
      fx.debate(2);
      fx.momentum(c.roll(0.55 + c.competence * 0.3) ? 0.03 : 0.005, "propostas no último debate");
      return "Você falou do futuro enquanto os outros brigavam. Quem estava indeciso prestou atenção.";
    } },
    { id: "defender", label: "Defesa: não errar", tone: "neutral", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.momentum(0.005);
      return "Nenhum erro, nenhum brilho. Quem estava na frente continuou na frente.";
    } },
  ],
  fallback: "defender",
});

const boca_de_urna = ev({
  id: "esc_vespera_eleicao",
  kind: "DECISAO",
  tags: ["CAMPANHA", "ELEICAO"],
  cooldown: 400,
  expires: 1,
  when: (c) => ((c.phase === "RETA_FINAL" || c.phase === "SEGUNDO_TURNO") && (c.daysToVote ?? 99) <= 3 ? {} : null),
  title: () => "Véspera da eleição",
  text: () => "Faltam poucos dias. A coordenação propõe um último esforço. Um dos cabos eleitorais sugere \"o de sempre\": gente com santinho na porta das seções no dia da votação.",
  opts: [
    { id: "carreata", label: "Carreata final e descanso no dia", tone: "safe", cost: () => ({ energy: 10 }), run: (_c, _b, fx) => {
      fx.momentum(0.015, "carreata final");
      return "Buzinaço pela cidade e dormir cedo. No dia, você votou e esperou.";
    } },
    { id: "telefone", label: "Mutirão de mensagens e ligações", tone: "neutral", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.seg("all", 0.01, "mutirão de última hora");
      return "Dez mil mensagens, mil ligações. Lembrar o eleitor também é campanha.";
    } },
    { id: "boca", label: "Liberar a boca de urna", hint: "Crime eleitoral no dia da votação", tone: "illegal", run: (c, _b, fx) => {
      fx.seg("all", 0.015);
      if (c.roll(0.4)) {
        fx.scandal(6);
        fx.rumor(5);
        fx.news("Cabos eleitorais detidos por boca de urna", "Apoiadores de candidato(a) são levados à delegacia com material de campanha no dia da eleição.");
        return "Três cabos eleitorais foram detidos com santinhos. Seu nome estava no boletim de ocorrência.";
      }
      return "Ninguém foi pego. Você não sabe quantos votos aquilo valeu — nem quer saber.";
    } },
  ],
  fallback: "carreata",
});

// ================================================================ mandato

const emenda_destino = ev({
  id: "esc_emenda_destino",
  kind: "DECISAO",
  tags: ["MANDATO"],
  cooldown: 200,
  expires: 5,
  when: (c) => (c.p.office_code ? { v: c.money(c.p.office_code === "VEREADOR" ? 300_000 : 2_000_000) } : null),
  title: () => "Para onde vai a sua emenda?",
  text: (_c, b) => `Você tem ${brl(Number(b.v))} em emendas para indicar este ano. Três pedidos chegaram à sua mesa e não dá para atender todos.`,
  opts: [
    { id: "hospital", label: "Equipar o hospital regional", tone: "safe", run: (_c, _b, fx) => {
      fx.reputation(1.5);
      fx.reach(0.004);
      return "Novos leitos e um tomógrafo com uma plaquinha discreta. Os aposentados não esquecem.";
    } },
    { id: "estrada", label: "Asfaltar a estrada do interior", tone: "neutral", run: (c, _b, fx) => {
      fx.reputation(1);
      const prefeito = localPolitician(c, { office: "PREFEITO" });
      if (prefeito) fx.rel(prefeito.id, 6);
      return "Os produtores rurais agradeceram — e o prefeito também, com foto na inauguração.";
    } },
    { id: "escola", label: "Reformar escolas da periferia", tone: "safe", run: (_c, _b, fx) => {
      fx.reputation(1.2);
      fx.activism(2);
      return "Quadras cobertas e banheiros novos. Os pais viram, os filhos usaram.";
    } },
    { id: "aliado", label: "Para a base de um aliado, em troca de apoio", tone: "risky", run: (c, _b, fx) => {
      fx.capital(4);
      const aliado = localPolitician(c, { exclude: [c.p.id] });
      if (aliado) fx.rel(aliado.id, 12);
      if (c.roll(0.25)) {
        fx.scandal(3);
        return "A troca foi parar numa coluna de bastidores. O apoio veio, a desconfiança também.";
      }
      return "Emenda trocada por apoio. É assim que se faz maioria — e é assim que se perde o sono.";
    } },
  ],
  fallback: "hospital",
});

const voto_governo = ev({
  id: "esc_voto_governo",
  kind: "DECISAO",
  tags: ["MANDATO", "BASTIDORES"],
  cooldown: 150,
  expires: 3,
  when: (c) => (c.p.office_code && ["VEREADOR", "DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"].includes(c.p.office_code) ? { tema: c.rng.pick(["aumento de impostos sobre combustíveis", "privatização da companhia de água", "corte no orçamento da universidade", "reajuste dos servidores"]) } : null),
  title: () => "O governo quer o seu voto",
  text: (_c, b) => `O líder do governo ligou: a votação sobre ${b.tema} está apertada, e o seu voto pode decidir. "Quem ajuda agora, é lembrado na hora das emendas."`,
  opts: [
    { id: "governo", label: "Votar com o governo", tone: "neutral", run: (_c, _b, fx) => {
      fx.capital(4);
      fx.reputation(-0.8);
      return "Votou com o governo. As emendas vão sair mais rápido; a explicação para a base, nem tanto.";
    } },
    { id: "contra", label: "Votar contra", tone: "bold", run: (_c, _b, fx) => {
      fx.capital(-3);
      fx.reputation(1.2);
      fx.visibility(1.5);
      return "Voto contra, discurso na tribuna e retaliação prometida. Sua base aplaudiu.";
    } },
    { id: "negociar", label: "Negociar uma contrapartida para a sua região", tone: "risky", run: (c, _b, fx) => {
      if (c.roll(0.5 + c.competence * 0.3)) {
        fx.capital(3);
        fx.reputation(0.6);
        return "Seu voto saiu caro: uma obra na sua região entrou no acordo. Todo mundo ganhou.";
      }
      fx.capital(-2);
      return "O governo achou o preço alto demais e conseguiu o voto de outro.";
    } },
    { id: "ausente", label: "Faltar à votação", tone: "neutral", run: (_c, _b, fx) => {
      fx.reputation(-0.5);
      return "Uma consulta médica bem na hora da votação. Ninguém acreditou.";
    } },
  ],
  fallback: "ausente",
});

const cpi = ev({
  id: "esc_convite_cpi",
  kind: "DECISAO",
  tags: ["MANDATO", "IMPRENSA"],
  cooldown: 300,
  expires: 4,
  when: (c) => (c.p.office_code && ["VEREADOR", "DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"].includes(c.p.office_code) ? { tema: c.rng.pick(["dos contratos da merenda", "das apostas online", "da crise na saúde", "dos contratos de iluminação"]) } : null),
  title: () => "Convite para uma CPI",
  text: (_c, b) => `Abriram a CPI ${b.tema}, e o seu partido quer você entre os membros. Holofote garantido — e inimigos também.`,
  opts: [
    { id: "aceitar", label: "Entrar e investigar a fundo", tone: "bold", cost: () => ({ energy: 15 }), run: (c, _b, fx) => {
      fx.visibility(3);
      fx.reach(0.008);
      fx.reputation(c.roll(0.6) ? 2 : 0.5);
      return "Depoimentos tensos, perguntas duras e você em todos os telejornais da semana.";
    } },
    { id: "figurante", label: "Entrar, mas sem se expor", tone: "safe", cost: () => ({ energy: 5 }), run: (_c, _b, fx) => {
      fx.capital(1);
      return "Presença em todas as sessões, poucas perguntas. Ninguém notou — nem para o bem, nem para o mal.";
    } },
    { id: "recusar", label: "Recusar", tone: "neutral", run: (_c, _b, fx) => {
      fx.standing(-1);
      return "O partido indicou outra pessoa — e anotou a recusa.";
    } },
  ],
  fallback: "figurante",
});

const lobista = ev({
  id: "esc_lobista",
  kind: "DECISAO",
  tags: ["MANDATO", "BASTIDORES", "DINHEIRO"],
  cooldown: 250,
  expires: 3,
  when: (c) => (c.p.office_code ? { setor: c.rng.pick(["de planos de saúde", "de apostas esportivas", "de mineração", "de transporte urbano"]), v: c.money(c.p.office_code === "VEREADOR" ? 20_000 : 150_000) } : null),
  title: () => "Visita de um lobista",
  text: (_c, b) => `Um representante do setor ${b.setor} pediu quinze minutos no gabinete. Trouxe um estudo, um projeto pronto — e, no fim, um convite para uma "consultoria" de ${brl(Number(b.v))} para um parente seu.`,
  opts: [
    { id: "ouvir", label: "Ouvir o estudo e recusar a consultoria", tone: "safe", run: (_c, _b, fx) => {
      fx.capital(1);
      return "Você leu o estudo, devolveu o envelope e anotou tudo. Lobby às claras é parte do jogo.";
    } },
    { id: "aceitar", label: "Aceitar a consultoria", tone: "illegal", run: (c, b, fx) => {
      fx.dirty(Number(b.v));
      fx.illicit("TRAFICO_INFLUENCIA", { amount: Number(b.v), description: `Consultoria paga a parente por empresa do setor ${b.setor}`, witnesses: 2, paperTrail: 0.55 });
      return "Contrato assinado em nome do seu cunhado. O projeto do setor vai andar mais rápido.";
    } },
    { id: "denunciar", label: "Expor a tentativa na tribuna", tone: "bold", run: (c, _b, fx) => {
      fx.visibility(2);
      fx.reputation(c.roll(0.6) ? 1.5 : 0.3);
      fx.capital(-2);
      return "Você contou tudo no plenário. Ganhou manchete — e perdeu amigos influentes.";
    } },
  ],
  fallback: "ouvir",
});

const assessor = ev({
  id: "esc_assessor_salario",
  kind: "DECISAO",
  tags: ["MANDATO", "DINHEIRO"],
  cooldown: 300,
  expires: 3,
  when: (c) => (c.p.office_code ? { quem: c.rng.pick(AMIGOS) } : null),
  title: () => "Seu chefe de gabinete propõe um esquema",
  text: (_c, b) => `${b.quem}, seu chefe de gabinete, sugere: "A gente contrata mais gente com salário cheio e cada um devolve uma parte. Todo gabinete faz. Dá pra bancar a próxima campanha."`,
  opts: [
    { id: "nao", label: "Proibir e deixar claro que é crime", tone: "safe", run: (_c, _b, fx) => {
      fx.reputation(0.4);
      return "Você cortou a conversa ali. O gabinete entendeu o recado.";
    } },
    { id: "demitir", label: "Demitir quem propôs", tone: "bold", run: (_c, _b, fx) => {
      fx.energy(-6);
      fx.reputation(0.6);
      return "Você trocou o chefe de gabinete. Duas semanas de bagunça, consciência tranquila.";
    } },
    { id: "aceitar", label: "Topar a \"devolução\"", hint: "Rachadinha", tone: "illegal", run: (c, _b, fx) => {
      const v = c.money(8_000);
      fx.dirty(v);
      fx.illicit("RACHADINHA", { amount: v, description: "Devolução de parte dos salários de assessores", witnesses: 5, paperTrail: 0.5, ongoing: true, monthlyGain: v });
      return "Todo mês, um envelope. Cinco assessores sabem. Cinco.";
    } },
  ],
  fallback: "nao",
});

const projeto_viral = ev({
  id: "esc_projeto_viral",
  kind: "DECISAO",
  tags: ["MANDATO", "IMPRENSA"],
  cooldown: 300,
  expires: 4,
  when: (c) => (c.p.office_code && ["VEREADOR", "DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"].includes(c.p.office_code) ? { tema: c.rng.pick(["proíbe celular nas salas de aula", "cria passe livre para estudantes", "limita juros do cartão de crédito", "obriga hospitais a divulgar filas"]) } : null),
  title: () => "Seu projeto viralizou",
  text: (_c, b) => `O seu projeto que ${b.tema} explodiu nas redes. Metade ama, metade odeia, e a presidência da casa quer saber se você vai pedir urgência.`,
  opts: [
    { id: "urgencia", label: "Pedir urgência e ir para o tudo ou nada", tone: "bold", run: (c, _b, fx) => {
      fx.visibility(3);
      if (c.roll(0.45 + c.st.political_capital / 200)) {
        fx.reputation(2.5);
        fx.capital(-2);
        return "Aprovado em regime de urgência! Seu nome ficou ligado à lei.";
      }
      fx.capital(-4);
      fx.reputation(-0.5);
      return "Derrota no plenário. O projeto voltou para a gaveta — e os adversários comemoraram.";
    } },
    { id: "negociar", label: "Negociar mudanças para aprovar", tone: "safe", run: (_c, _b, fx) => {
      fx.capital(1);
      fx.reputation(1);
      return "O texto saiu mais suave, mas saiu. Meia vitória ainda é vitória.";
    } },
    { id: "esperar", label: "Deixar a poeira baixar", tone: "neutral", run: (_c, _b, fx) => {
      fx.reach(0.004);
      return "O projeto esfriou, mas o seu nome ficou conhecido.";
    } },
  ],
  fallback: "esperar",
});

const imprensa_gastos = ev({
  id: "esc_imprensa_gastos",
  kind: "DECISAO",
  tags: ["MANDATO", "IMPRENSA"],
  cooldown: 300,
  expires: 2,
  when: (c) => (c.p.office_code ? { item: c.rng.pick(["passagens aéreas", "combustível", "aluguel de carros", "divulgação do mandato"]) } : null),
  title: () => "Um repórter pergunta sobre os seus gastos",
  text: (_c, b) => `Um repórter levantou os gastos do seu gabinete com ${b.item} e quer uma resposta até amanhã. Os números são altos — mas, até onde você sabe, legais.`,
  opts: [
    { id: "transparencia", label: "Abrir todas as notas fiscais", tone: "safe", cost: () => ({ energy: 6 }), run: (_c, _b, fx) => {
      fx.reputation(1);
      return "Notas abertas, conta explicada. A matéria saiu com o seu lado da história.";
    } },
    { id: "cortar", label: "Anunciar corte nos gastos", tone: "bold", run: (_c, _b, fx) => {
      fx.reputation(1.5);
      fx.capital(-1);
      return "\"Parlamentar corta 40% dos gastos\": manchete boa, colegas incomodados.";
    } },
    { id: "atacar", label: "Acusar o jornal de perseguição", tone: "risky", run: (c, _b, fx) => {
      if (c.roll(0.35)) {
        fx.visibility(2);
        return "Seus seguidores compraram a briga. O jornal virou o vilão da semana.";
      }
      fx.reputation(-1.5);
      fx.scandal(2);
      return "O ataque virou a notícia. Agora são duas matérias contra você.";
    } },
  ],
  fallback: "transparencia",
});

const obra_parada = ev({
  id: "esc_obra_parada",
  kind: "DECISAO",
  tags: ["MANDATO", "COMUNIDADE"],
  cooldown: 300,
  expires: 4,
  when: (c) => (c.p.office_code ? { obra: c.rng.pick(["a creche do bairro", "a ponte do córrego", "o posto de saúde", "o viaduto da entrada da cidade"]), hood: home(c) } : null),
  title: () => "A obra que você prometeu está parada",
  text: (_c, b) => `Moradores do ${b.hood} penduraram uma faixa: "Cadê ${b.obra}?". A construtora diz que falta repasse; o governo diz que falta projeto.`,
  opts: [
    { id: "cobrar", label: "Cobrar o governo publicamente", tone: "bold", run: (c, _b, fx) => {
      fx.visibility(1.5);
      const prefeito = localPolitician(c, { office: "PREFEITO" });
      if (prefeito) fx.rel(prefeito.id, -5);
      fx.reputation(c.roll(0.55) ? 1.5 : 0.3);
      return "Você fez barulho até a obra voltar ao cronograma. Ou quase.";
    } },
    { id: "explicar", label: "Ir até lá explicar o atraso", tone: "safe", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.reputation(0.6);
      return "Cara a cara com os moradores. Não resolveu a obra, mas desarmou a raiva.";
    } },
    { id: "inaugurar", label: "Fazer uma \"inauguração simbólica\"", tone: "risky", run: (c, _b, fx) => {
      if (c.roll(0.3)) {
        fx.visibility(2);
        return "Fita cortada, foto bonita. Ninguém reparou que a obra não terminou.";
      }
      fx.reputation(-2);
      fx.scandal(2);
      return "\"Inauguram obra inacabada\" — o vídeo do canteiro vazio rodou a cidade.";
    } },
  ],
  fallback: "explicar",
});

const comissao = ev({
  id: "esc_presidencia_comissao",
  kind: "DECISAO",
  tags: ["MANDATO", "BASTIDORES"],
  cooldown: 500,
  expires: 4,
  when: (c) => (c.p.office_code && ["VEREADOR", "DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"].includes(c.p.office_code) && c.st.political_capital >= 20 ? { com: c.rng.pick(["de Saúde", "de Educação", "de Finanças", "de Constituição e Justiça"]) } : null),
  title: (_c, b) => `A presidência da comissão ${b.com}`,
  text: (_c, b) => `A presidência da comissão ${b.com} está em disputa. Quem preside decide a pauta — e recebe visitas de muita gente importante.`,
  opts: [
    { id: "disputar", label: "Disputar a presidência", tone: "bold", cost: () => ({ energy: 10 }), run: (c, b, fx) => {
      if (c.roll(0.35 + c.st.political_capital / 150)) {
        fx.capital(6);
        fx.visibility(2);
        fx.flag("comissao", String(b.com));
        return `Eleito(a) presidente da comissão ${b.com}. A pauta agora passa por você.`;
      }
      fx.capital(-3);
      return "Perdeu por dois votos. Os aliados que faltaram vão ouvir de você.";
    } },
    { id: "apoiar", label: "Apoiar um aliado em troca de relatoria", tone: "safe", run: (c, _b, fx) => {
      fx.capital(3);
      const aliado = localPolitician(c, { exclude: [c.p.id], partyId: c.p.party_id });
      if (aliado) fx.rel(aliado.id, 8);
      return "Seu aliado presidiu, você ficou com a relatoria mais importante do ano.";
    } },
    { id: "fora", label: "Ficar de fora", tone: "neutral", run: () => "Você ficou longe da briga. Outros dividiram o poder." },
  ],
  fallback: "fora",
});

// ================================================================ partido

const previas = ev({
  id: "esc_previas",
  kind: "DECISAO",
  tags: ["PARTIDO", "ELEICAO"],
  cooldown: 400,
  expires: 4,
  when: (c) => (preCampanha(c) ? {} : null),
  title: () => "Prévias no partido",
  text: (c) => `O ${c.party?.acronym ?? "partido"} vai fazer prévias para definir a chapa. Os filiados votam numa plenária daqui a duas semanas. Você precisa decidir como entrar nessa.`,
  opts: [
    { id: "campanha", label: "Fazer campanha interna, filiado por filiado", tone: "bold", cost: () => ({ energy: 15 }), run: (c, _b, fx) => {
      fx.standing(c.roll(0.6) ? 6 : 3);
      return "Ligações, cafés e visitas. Na plenária, muitos já chegaram com o seu nome.";
    } },
    { id: "acordo", label: "Fechar um acordo com a direção", tone: "safe", run: (c, _b, fx) => {
      const l = lider(c);
      if (l && l.id !== c.p.id) fx.rel(l.id, 6);
      fx.standing(3);
      fx.capital(-2);
      return "Acordo fechado nos bastidores. Você entra na chapa — e fica devendo.";
    } },
    { id: "discurso", label: "Apostar num grande discurso na plenária", tone: "risky", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      if (c.roll(0.4 + c.charisma * 0.4)) {
        fx.standing(7);
        return "Você foi aplaudido(a) de pé. O discurso decidiu as prévias.";
      }
      fx.standing(-2);
      return "O discurso não emplacou. Na votação, faltou voto.";
    } },
  ],
  fallback: "acordo",
});

const contribuicao_campanha_partido = ev({
  id: "esc_partido_pede_dinheiro",
  kind: "DECISAO",
  tags: ["PARTIDO", "DINHEIRO"],
  cooldown: 300,
  expires: 4,
  when: (c) => (c.p.party_id && c.st.money > c.money(5_000) ? { v: c.money(c.p.office_code ? 15_000 : 2_500) } : null),
  title: () => "O partido passa o chapéu",
  text: (c, b) => `O ${c.party?.acronym ?? "partido"} está sem dinheiro para alugar a nova sede e pediu aos filiados mais ativos uma contribuição extra de ${brl(Number(b.v))}.`,
  opts: [
    { id: "doar", label: "Contribuir com o valor pedido", tone: "safe", cost: (_c, b) => ({ money: Number(b.v) }), run: (_c, _b, fx) => {
      fx.standing(4);
      return "Seu nome entrou na plaquinha de \"fundadores da sede\". A direção não esquece.";
    } },
    { id: "metade", label: "Contribuir com metade", tone: "neutral", cost: (_c, b) => ({ money: Math.round(Number(b.v) / 2) }), run: (_c, _b, fx) => {
      fx.standing(1.5);
      return "Meia contribuição, meio agradecimento.";
    } },
    { id: "nao", label: "Não contribuir", tone: "neutral", run: (_c, _b, fx) => {
      fx.standing(-1.5);
      return "A tesoureira anotou quem ajudou — e quem não ajudou.";
    } },
  ],
  fallback: "nao",
});

const alianca_local = ev({
  id: "esc_alianca_rival",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  cooldown: 300,
  expires: 4,
  when: (c) => (c.p.party_id ? { rival: c.rng.pick(["o partido que você mais criticou", "o maior adversário do seu partido", "um partido envolvido em escândalo"]) } : null),
  title: () => "Aliança com o adversário?",
  text: (c, b) => `A direção do ${c.party?.acronym ?? "partido"} quer fechar aliança com ${b.rival} nas próximas eleições em ${city(c)}. A base está revoltada. Você foi chamado(a) para votar na executiva.`,
  opts: [
    { id: "favor", label: "Votar a favor: política é somar", tone: "neutral", run: (c, _b, fx) => {
      fx.standing(2);
      const l = lider(c);
      if (l && l.id !== c.p.id) fx.rel(l.id, 5);
      fx.activism(-2);
      return "A aliança passou com o seu voto. Os militantes mais antigos pararam de responder suas mensagens.";
    } },
    { id: "contra", label: "Votar contra e falar com a base", tone: "bold", run: (_c, _b, fx) => {
      fx.standing(-2);
      fx.activism(3);
      fx.reputation(0.6);
      return "Você liderou a resistência. Perdeu na executiva, ganhou a militância.";
    } },
    { id: "abster", label: "Se abster", tone: "safe", run: () => "Abstenção. Ninguém ficou bravo com você — nem lembrou de você." },
  ],
  fallback: "abster",
});

const porta_voz = ev({
  id: "esc_porta_voz",
  kind: "OPORTUNIDADE",
  tags: ["PARTIDO", "IMPRENSA"],
  cooldown: 300,
  expires: 5,
  when: (c) => (c.p.party_id && c.st.party_standing >= 30 ? { tema: c.rng.pick(["a reforma tributária", "a crise na segurança", "o escândalo do governo", "a eleição do ano que vem"]) } : null),
  title: () => "Porta-voz do partido na TV",
  text: (c, b) => `O ${c.party?.acronym ?? "partido"} quer você como porta-voz num programa de entrevistas sobre ${b.tema}. Ao vivo, com um apresentador conhecido por encurralar convidados.`,
  opts: [
    { id: "ir", label: "Topar e se preparar", tone: "bold", cost: () => ({ energy: 10 }), run: (c, _b, fx) => {
      fx.debate(2);
      if (c.roll(0.45 + c.competence * 0.25 + c.charisma * 0.2)) {
        fx.visibility(3);
        fx.standing(3);
        fx.reach(0.008);
        return "Respostas firmes, nenhum tropeço. No dia seguinte, três partidos sabiam o seu nome.";
      }
      fx.visibility(1);
      fx.standing(-1);
      return "O apresentador achou um furo na sua resposta. O trecho rodou mais do que o resto.";
    } },
    { id: "recusar", label: "Sugerir outra pessoa", tone: "safe", run: (_c, _b, fx) => {
      fx.standing(-0.5);
      return "Você indicou um colega. Ele foi bem — e quem ganhou espaço foi ele.";
    } },
  ],
  fallback: "recusar",
});

const outro_partido = ev({
  id: "esc_convite_troca",
  kind: "DECISAO",
  tags: ["PARTIDO", "BASTIDORES"],
  cooldown: 400,
  expires: 5,
  when: (c) => (c.p.party_id && c.st.party_standing >= 25 && c.p.reputation >= 25 ? { outro: c.rng.pick(["um partido maior", "um partido em ascensão", "um partido com mais fundo eleitoral"]) } : null),
  title: () => "Um convite discreto",
  text: (c, b) => `Um dirigente de ${b.outro} chamou você para um café: "No ${c.party?.acronym ?? "seu partido"} você vai esperar dez anos na fila. Aqui, você é prioridade." Ninguém sabe dessa conversa — ainda.`,
  opts: [
    { id: "ouvir", label: "Ouvir a proposta e não se comprometer", tone: "neutral", run: (_c, _b, fx) => {
      fx.capital(2);
      return "Você ouviu tudo, agradeceu e guardou o cartão. Sempre bom saber que há porta aberta.";
    } },
    { id: "contar", label: "Contar ao seu partido e usar como trunfo", tone: "bold", run: (c, _b, fx) => {
      if (c.roll(0.55)) {
        fx.standing(5);
        return "A direção percebeu que podia perder você. De repente, havia espaço na chapa.";
      }
      fx.standing(-2);
      return "A direção não gostou de ser pressionada. \"Quem quer sair, que saia.\"";
    } },
    { id: "recusar", label: "Recusar na hora", tone: "safe", run: (_c, _b, fx) => {
      fx.standing(1);
      return "Lealdade tem valor. Alguém da direção ficou sabendo — e gostou.";
    } },
  ],
  fallback: "ouvir",
});

const diretorio = ev({
  id: "esc_eleicao_diretorio",
  kind: "DECISAO",
  tags: ["PARTIDO"],
  cooldown: 500,
  expires: 5,
  when: (c) => (c.p.party_id && c.st.party_standing >= 40 && !c.p.office_code ? {} : null),
  title: () => "Eleição para a executiva municipal",
  text: (c) => `O ${c.party?.acronym ?? "partido"} vai renovar a executiva em ${city(c)}. Seus aliados querem você numa das vagas — tesouraria ou secretaria-geral.`,
  opts: [
    { id: "tesouraria", label: "Disputar a tesouraria", tone: "bold", cost: () => ({ energy: 10 }), run: (c, _b, fx) => {
      if (c.roll(0.55)) {
        fx.standing(6);
        fx.capital(3);
        return "Tesoureiro(a) do partido na cidade. Agora você sabe para onde vai cada centavo.";
      }
      fx.standing(-1);
      return "Perdeu a disputa para um veterano. Ficou a lição.";
    } },
    { id: "secretaria", label: "Disputar a secretaria-geral", tone: "safe", cost: () => ({ energy: 8 }), run: (c, _b, fx) => {
      fx.standing(c.roll(0.6) ? 5 : 1);
      return "Secretaria-geral: atas, reuniões e o telefone de todo mundo do partido.";
    } },
    { id: "nao", label: "Não disputar agora", tone: "neutral", run: () => "Você preferiu esperar. A executiva foi formada sem você." },
  ],
  fallback: "nao",
});

// ================================================================ vida

const namoro = ev({
  id: "esc_alguem_especial",
  kind: "DECISAO",
  tags: ["VIDA"],
  cooldown: 500,
  max: 2,
  expires: 5,
  when: (c) => (c.age < 50 && !c.flag("relacionamento") ? { nome: c.rng.pick(["Bia", "Rafael", "Luana", "Caio", "Marina", "Pedro"]) } : null),
  title: () => "Alguém especial",
  text: (_c, b) => `Você conheceu ${b.nome} num aniversário de amigos e, desde então, as mensagens não param. O problema: sua agenda está lotada de política.`,
  opts: [
    { id: "investir", label: "Abrir espaço na agenda", tone: "safe", cost: () => ({ energy: 6 }), run: (_c, b, fx) => {
      fx.flag("relacionamento", String(b.nome));
      fx.health(2);
      fx.activism(-1);
      return "Jantares, cinema e menos reuniões. Você anda sorrindo mais.";
    } },
    { id: "discreto", label: "Levar devagar, sem mudar a rotina", tone: "neutral", run: (c, b, fx) => {
      if (c.roll(0.5)) {
        fx.flag("relacionamento", String(b.nome));
        return "Devagar e sempre. Está dando certo.";
      }
      return "Devagar demais: as mensagens foram rareando até parar.";
    } },
    { id: "nao", label: "Agora não dá", tone: "neutral", run: (_c, _b, fx) => {
      fx.health(-1);
      return "A política venceu. Às vezes, à noite, você pensa nisso.";
    } },
  ],
  fallback: "discreto",
});

const casa = ev({
  id: "esc_casa_propria",
  kind: "DECISAO",
  tags: ["VIDA", "DINHEIRO"],
  cooldown: 700,
  max: 2,
  expires: 6,
  when: (c) => (c.st.money > c.money(40_000) ? { v: c.money(c.rng.pick([280_000, 420_000, 650_000])), hood: home(c) } : null),
  title: () => "A casa própria",
  text: (_c, b) => `Uma casa no ${b.hood} está à venda por ${brl(Number(b.v))}. Dá para dar uma entrada e financiar o resto em vinte anos — ou continuar no aluguel e manter o dinheiro livre para a carreira.`,
  opts: [
    { id: "financiar", label: "Dar entrada e financiar", tone: "neutral", run: (c, b, fx) => {
      const entrada = Math.round(Number(b.v) * 0.2);
      fx.money(-entrada, "Entrada da casa própria");
      fx.debt(Number(b.v) - entrada);
      c.st.assets += Number(b.v);
      fx.health(1);
      return "Chave na mão. Dívida também — por vinte anos.";
    } },
    { id: "vista", label: "Comprar à vista", tone: "bold", requires: (c, b) => (c.st.money >= Number(b.v) ? null : "Dinheiro insuficiente."), run: (c, b, fx) => {
      fx.money(-Number(b.v), "Compra da casa própria");
      c.st.assets += Number(b.v);
      fx.health(1);
      return "Escritura no seu nome, sem dever nada a ninguém.";
    } },
    { id: "aluguel", label: "Continuar no aluguel", tone: "safe", run: () => "Dinheiro livre para a carreira. A casa foi vendida para outra família." },
  ],
  fallback: "aluguel",
});

const investimento = ev({
  id: "esc_investimento_amigo",
  kind: "DECISAO",
  tags: ["VIDA", "DINHEIRO"],
  cooldown: 400,
  expires: 3,
  when: (c) => (c.st.money > c.money(15_000) ? { quem: c.rng.pick(AMIGOS), neg: c.rng.pick(["uma hamburgueria", "uma startup de entregas", "uma loja de roupas", "um food truck"]), v: c.money(c.rng.pick([5_000, 10_000, 20_000])) } : null),
  title: (_c, b) => `${b.quem} quer um sócio`,
  text: (_c, b) => `${b.quem} está abrindo ${b.neg} e quer ${brl(Number(b.v))} seus como sócio(a). "Em dois anos, a gente dobra."`,
  opts: [
    { id: "investir", label: "Investir tudo o que foi pedido", tone: "risky", cost: (_c, b) => ({ money: Number(b.v) }), run: (c, b, fx) => {
      if (c.roll(0.4)) {
        fx.schedule("esc_investimento_retorno", [120, 240], { quem: String(b.quem), v: Math.round(Number(b.v) * 2.2) });
        return "Contrato de sócio assinado. Agora é torcer.";
      }
      return "Contrato assinado. Seis meses depois, a placa de \"passa-se o ponto\" apareceu na porta.";
    } },
    { id: "pouco", label: "Investir um pouco, por amizade", tone: "safe", cost: (_c, b) => ({ money: Math.round(Number(b.v) / 4) }), run: (c, b, fx) => {
      if (c.roll(0.5)) fx.schedule("esc_investimento_retorno", [120, 240], { quem: String(b.quem), v: Math.round((Number(b.v) / 4) * 1.8) });
      return "Uma ajuda simbólica. Se der certo, ótimo; se não, valeu pela amizade.";
    } },
    { id: "nao", label: "Não investir", tone: "neutral", run: () => "Você desejou sorte e manteve o dinheiro." },
  ],
  fallback: "nao",
});

const investimento_retorno: EventDef = {
  id: "esc_investimento_retorno",
  kind: "INFO",
  tags: ["DINHEIRO", "VIDA"],
  chained: true,
  when: (_c, data) => data ?? null,
  render: (_c, b) => ({ title: `O negócio de ${b.quem} deu certo`, text: `${b.quem} apareceu com um envelope: "Sua parte dos lucros. Eu disse que ia dar certo."`, choices: [] }),
  resolve: (_c, b, _choice, fx) => {
    fx.money(Number(b.v), `Lucro da sociedade com ${b.quem}`);
    return "O investimento rendeu.";
  },
};

const familiar_doente = ev({
  id: "esc_familiar_doente",
  kind: "DECISAO",
  tags: ["VIDA", "SAUDE"],
  cooldown: 500,
  expires: 3,
  when: (c) => ({ quem: c.rng.pick(["sua mãe", "seu pai", "sua avó", "seu irmão mais velho"]), v: c.money(c.rng.pick([6_000, 12_000])) }),
  title: () => "Um susto na família",
  text: (_c, b) => `${String(b.quem)[0].toUpperCase()}${String(b.quem).slice(1)} foi internado(a) às pressas. O plano de saúde cobre parte; o resto, uns ${brl(Number(b.v))}, ficaria com a família. E alguém precisa estar no hospital.`,
  opts: [
    { id: "presente", label: "Largar tudo e ficar no hospital", tone: "safe", cost: () => ({ energy: 15 }), run: (_c, _b, fx) => {
      fx.health(-1);
      fx.activism(-2);
      return "Duas semanas de corredor de hospital. A recuperação veio — e você estava lá.";
    } },
    { id: "pagar", label: "Pagar o melhor tratamento", tone: "neutral", cost: (_c, b) => ({ money: Number(b.v) }), run: () => "Quarto particular, especialistas e alta antes do previsto. O dinheiro foi bem gasto." },
    { id: "dividir", label: "Dividir os cuidados com os irmãos", tone: "neutral", cost: () => ({ energy: 6 }), run: () => "Cada um um turno. A família se uniu — e você conseguiu manter a agenda." },
  ],
  fallback: "dividir",
});

const livro = ev({
  id: "esc_convite_coluna",
  kind: "OPORTUNIDADE",
  tags: ["VIDA", "IMPRENSA"],
  cooldown: 500,
  max: 2,
  expires: 6,
  when: (c) => (c.p.reputation >= 30 ? { onde: c.rng.pick(["o jornal da cidade", "um portal de notícias", "uma revista de política"]) } : null),
  title: () => "Convite para escrever uma coluna",
  text: (_c, b) => `${String(b.onde)[0].toUpperCase()}${String(b.onde).slice(1)} quer uma coluna sua, toda semana. Sem pagamento — mas com milhares de leitores.`,
  opts: [
    { id: "aceitar", label: "Aceitar", tone: "bold", cost: () => ({ energy: 8 }), run: (_c, _b, fx) => {
      fx.visibility(2);
      fx.reach(0.006);
      fx.debate(2);
      return "Toda semana, um texto seu. Escrever organiza as ideias — e espalha seu nome.";
    } },
    { id: "ghost", label: "Aceitar, mas com um assessor escrevendo", tone: "risky", run: (c, _b, fx) => {
      fx.visibility(1.5);
      if (c.roll(0.25)) {
        fx.reputation(-1);
        return "Um leitor percebeu que o estilo mudava toda semana. A fofoca correu.";
      }
      return "Textos bem escritos, assinados por você. Ninguém precisa saber.";
    } },
    { id: "recusar", label: "Recusar", tone: "neutral", run: () => "Sem tempo para escrever. A vaga ficou com outro político." },
  ],
  fallback: "recusar",
});

// ================================================================ bastidores

const audio_vazado = ev({
  id: "esc_audio_vazado",
  kind: "DECISAO",
  tags: ["BASTIDORES", "IMPRENSA"],
  cooldown: 400,
  expires: 2,
  when: (c) => (c.p.reputation >= 20 ? { sobre: c.rng.pick(["de um colega de partido", "dos eleitores de um bairro", "do prefeito", "da imprensa"]) } : null),
  title: () => "Um áudio seu vazou",
  text: (_c, b) => `Um áudio seu, mandado num grupo fechado, falando mal ${b.sobre}, vazou. Em duas horas, já estava em todos os grupos da cidade.`,
  opts: [
    { id: "desculpas", label: "Pedir desculpas publicamente", tone: "safe", run: (c, _b, fx) => {
      fx.reputation(c.roll(0.6) ? -0.5 : -1.5);
      fx.rumor(-1);
      return "Um vídeo curto, sem desculpa esfarrapada. A maioria aceitou; alguns nunca vão esquecer.";
    } },
    { id: "contexto", label: "Dizer que tiraram de contexto", tone: "neutral", run: (c, _b, fx) => {
      if (c.roll(0.4)) return "Sua versão colou: o áudio completo mostrava outra coisa. A polêmica morreu.";
      fx.reputation(-2);
      return "Publicaram o áudio completo. Era pior.";
    } },
    { id: "atacar", label: "Atacar quem vazou", tone: "risky", run: (c, _b, fx) => {
      fx.visibility(1.5);
      if (c.roll(0.35)) return "Você virou o foco para a traição de quem vazou. Funcionou — por enquanto.";
      fx.reputation(-2.5);
      fx.scandal(2);
      return "Ninguém quis saber de quem vazou. Só do que você disse.";
    } },
  ],
  fallback: "desculpas",
});

const exclusiva = ev({
  id: "esc_jornalista_exclusiva",
  kind: "DECISAO",
  tags: ["BASTIDORES", "IMPRENSA"],
  cooldown: 300,
  expires: 3,
  when: (c) => {
    if (c.p.reputation < 15 && !c.p.office_code) return null;
    const rival = localPolitician(c, { exclude: [c.p.id] });
    return rival ? { rival: rival.id, nome: rival.name } : null;
  },
  title: () => "Um jornalista quer uma exclusiva",
  text: (_c, b) => `Um repórter influente ofereceu uma entrevista exclusiva, de página inteira. No fim da conversa, em off, perguntou o que você sabe sobre ${b.nome}.`,
  opts: [
    { id: "entrevista", label: "Dar a entrevista e não falar dos outros", tone: "safe", cost: () => ({ energy: 6 }), run: (_c, _b, fx) => {
      fx.visibility(2.5);
      fx.reputation(0.8);
      return "Página inteira, foto boa, nenhuma fofoca. O repórter ficou com a impressão de alguém sério.";
    } },
    { id: "off", label: "Dar a entrevista e soltar um off sobre o rival", tone: "risky", cost: () => ({ energy: 6 }), run: (c, b, fx) => {
      fx.visibility(2.5);
      fx.rel(String(b.rival), -15);
      if (c.roll(0.3)) {
        fx.reputation(-1.5);
        return "O off virou manchete — e o rival descobriu a fonte em dois dias.";
      }
      fx.capital(2);
      return "O off rendeu uma nota que atingiu o rival. Ninguém sabe que foi você.";
    } },
    { id: "recusar", label: "Recusar", tone: "neutral", run: () => "Você preferiu não aparecer agora. A página inteira foi de outro." },
  ],
  fallback: "recusar",
});

const grupo_secreto = ev({
  id: "esc_grupo_politicos",
  kind: "DECISAO",
  tags: ["BASTIDORES"],
  cooldown: 500,
  max: 1,
  expires: 4,
  when: (c) => (c.p.office_code || c.st.party_standing >= 35 ? {} : null),
  title: () => "O grupo dos que mandam",
  text: (c) => `Você foi adicionado(a) a um grupo de mensagens com os políticos mais influentes de ${city(c)}. Ali se combinam votações, cargos e candidaturas — longe da imprensa.`,
  opts: [
    { id: "participar", label: "Participar ativamente", tone: "bold", run: (c, _b, fx) => {
      fx.capital(5);
      if (c.roll(0.2)) {
        fx.scandal(3);
        return "Você ganhou acesso a tudo — até que prints do grupo vazaram para um blog.";
      }
      return "Agora você sabe das coisas antes de acontecerem.";
    } },
    { id: "observar", label: "Ficar só observando", tone: "safe", run: (_c, _b, fx) => {
      fx.capital(2);
      return "Você lê tudo e não escreve nada. Informação é poder.";
    } },
    { id: "sair", label: "Sair do grupo", tone: "neutral", run: (_c, _b, fx) => {
      fx.capital(-1);
      fx.reputation(0.3);
      return "Você saiu. Alguns entenderam como integridade; outros, como arrogância.";
    } },
  ],
  fallback: "observar",
});

const dossie_rival = ev({
  id: "esc_dossie_rival",
  kind: "DECISAO",
  tags: ["BASTIDORES"],
  cooldown: 400,
  expires: 3,
  when: (c) => {
    if (!c.p.party_id) return null;
    const rival = localPolitician(c, { exclude: [c.p.id] });
    return rival ? { rival: rival.id, nome: rival.name } : null;
  },
  title: () => "Um dossiê na sua caixa de correio",
  text: (_c, b) => `Um envelope sem remetente: fotos, extratos e anotações sobre ${b.nome}. Pode ser verdade. Pode ser montagem. Pode ser uma armadilha para você.`,
  opts: [
    { id: "usar", label: "Divulgar nas redes", tone: "illegal", run: (c, b, fx) => {
      fx.rel(String(b.rival), -25);
      if (c.roll(0.5)) {
        fx.illicit("DESINFORMACAO", { amount: 0, description: `Divulgação de dossiê não verificado contra ${b.nome}`, witnesses: 3, paperTrail: 0.4 });
        fx.scandal(3);
        return "Era montagem. Agora quem responde a processo é você.";
      }
      fx.visibility(2);
      return "Era verdade. O rival passou a semana se explicando.";
    } },
    { id: "policia", label: "Entregar ao Ministério Público", tone: "safe", run: (_c, _b, fx) => {
      fx.reputation(0.8);
      return "O MP vai investigar. Se for verdade, a lei faz o resto — sem a sua digital.";
    } },
    { id: "lixo", label: "Jogar fora", tone: "neutral", run: () => "Você rasgou o envelope. Há guerras que não valem a pena." },
  ],
  fallback: "lixo",
});

export const CHOICE_EVENTS: EventDef[] = [
  carro_de_som,
  culto,
  sindicato,
  jantar_adesao,
  pede_dinheiro,
  video_falso,
  radio_comunitaria,
  marqueteiro,
  acordo_adversario,
  pesquisa_rua,
  voluntarios_briga,
  celebridade,
  agenda_dupla,
  jingle,
  ultimo_debate,
  boca_de_urna,
  emenda_destino,
  voto_governo,
  cpi,
  lobista,
  assessor,
  projeto_viral,
  imprensa_gastos,
  obra_parada,
  comissao,
  previas,
  contribuicao_campanha_partido,
  alianca_local,
  porta_voz,
  outro_partido,
  diretorio,
  namoro,
  casa,
  investimento,
  investimento_retorno,
  familiar_doente,
  livro,
  audio_vazado,
  exclusiva,
  grupo_secreto,
  dossie_rival,
];
